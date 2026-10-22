// P3's frozen workload. Importing this module is inert (Node classifier tests).
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { scheduleAbsolute } from './timing.mjs';
import { ev, within, LIMITS } from './bounded.mjs';

export const PERFORMANCE_PASSES = Object.freeze([
  'P3 completed draft cadence', 'P3 consecutive draft interval p95', 'P3 interaction p95',
  'P3 stress replacement', 'P3 application main-thread tasks', 'P3 first settled image',
  'P3 coverage and visible output',
]);
export function classifyAttempt(attempt) {
  if (attempt.applicationFailure || attempt.targets?.some(target => target.passed === false)) return { state: 'failed', reason: attempt.applicationFailure ?? 'an established application target failed' };
  if (attempt.harnessFailure?.demonstrated && attempt.harnessFailure.evidence) return { state: 'excluded', reason: attempt.harnessFailure.evidence };
  if (attempt.timing?.invalidated) return { state: 'inconclusive', reason: 'unexplained issuance anomaly over 4 ms' };
  if (!attempt.complete || !attempt.coverage || !attempt.targets?.length || attempt.targets.some(target => target.passed !== true)) return { state: 'inconclusive', reason: 'incomplete workload, coverage or target evidence' };
  return { state: 'passed', reason: 'complete valid trial; every frozen target passed' };
}
export function classifyTrials(attempts, required = 3, maximum = 5) {
  const classified = attempts.map(classifyAttempt), passing = classified.filter(a => a.state === 'passed').length;
  if (classified.some(a => a.state === 'failed')) return { state: 'failed', passing, reason: 'an application failure in any attempt prevents acceptance' };
  if (attempts.length > maximum || passing < required) return { state: 'inconclusive', passing, reason: 'insufficient valid passing trials within the attempt limit' };
  return { state: 'passed', passing, reason: 'at least three valid trials and no established application failure' };
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const p95 = values => values.length ? [...values].sort((a,b) => a-b)[Math.ceil(values.length * .95)-1] : null;
const total = r => r.hit + r.miss + r.numericalFailure + r.unresolved.pointBudget + r.unresolved.estimateUnavailable + r.unresolved.rayStepBudget + r.unresolved.stagnation.rayParameter + r.unresolved.stagnation.fieldCoordinate;
function coverageCounts(r) {
  return { hit:r.hit, miss:r.miss, numericalFailure:r.numericalFailure, 'point-budget':r.unresolved.pointBudget,
    'estimate-unavailable':r.unresolved.estimateUnavailable, 'ray-step-budget':r.unresolved.rayStepBudget,
    'stagnation:ray-parameter':r.unresolved.stagnation.rayParameter, 'stagnation:field-coordinate':r.unresolved.stagnation.fieldCoordinate };
}

// Installed before navigation. Long-task observation spans terminal tasks too;
// absence of observation is missing evidence, never a zero count.
function installObservation() {
  globalThis.__p3LongTasks = [];
  try {
    const observer = new PerformanceObserver(list => { for (const e of list.getEntries()) __p3LongTasks.push({ name:e.name, startTime:e.startTime, duration:e.duration, attribution:e.attribution?.map(a=>({name:a.name,containerSrc:a.containerSrc})) }); });
    observer.observe({ type:'longtask', buffered:true }); globalThis.__p3Observer = observer;
  } catch (error) { globalThis.__p3ObserverError = String(error); }
}

function startAttempt() {
  const s = atlas.space, trial = { issued:[], requests:[], publications:[], presentations:[], reports:[], phases:{}, timings:[], phase:'restore', input:null };
  globalThis.__p3 = trial;
  trial.stop = [s.onRequest(event => trial.requests.push({ identity:event.identity,purpose:event.purpose,createdAt:event.createdAt,
    quality:event.request.quality,sceneHash:event.request.sceneHash,camera:event.request.sceneSnapshot.camera,phase:trial.phase,input:trial.input })),
  s.onPublish(event => trial.publications.push(event)), s.onPresent(event => trial.presentations.push(event)),
  s.onReport(report => { const {outcomeMasks, ...small}=report; trial.reports.push({...small, observedAt:performance.now()}); })];
}

async function timedCamera({ phase, poses }) {
  const trial=__p3, start=performance.now(); trial.phase=phase;trial.phases[phase]={start};
  const timing=await __p3Schedule({clock:()=>performance.now(),setTimer:setTimeout}, poses.map(p=>start+p.requestTimeMs), (time,index)=>{
    const pose=poses[index]; trial.input=pose.requestIndex;trial.issued.push({phase,index:pose.requestIndex,...time});
    atlas.space.requestCamera(pose.camera,{phase:index===poses.length-1?'commit':'preview'});
  });
  trial.timings.push(timing);trial.phases[phase].end=performance.now();trial.phase=`after-${phase}`;
}
async function timedStress({alternation,count,spacingMs,durationMs}) {
  const trial=__p3,start=performance.now();trial.phase='stress';trial.phases.stress={start};
  const timing=await __p3Schedule({clock:()=>performance.now(),setTimer:setTimeout},Array.from({length:count},(_,i)=>start+spacingMs*i),(time,index)=>{
    trial.input=index;trial.issued.push({phase:'stress',index,...time});
    const result=atlas.space.editParameter(alternation.path,index%2?alternation.base:alternation.alternate);
    if(!result.ok)throw Error(result.error);
  });
  // Keep the complete ten-second stress window, including the last replacement.
  await __p3Schedule({clock:()=>performance.now(),setTimer:setTimeout},[start+durationMs],()=>{});
  trial.timings.push(timing);trial.phases.stress.end=performance.now();trial.phase='after-stress';
}

export function measureAttempt(trial, workload) {
  const valid=[], invalid=[];
  const byRequest=new Map(trial.requests.map(r=>[r.identity.requestId,r]));
  for(const publication of trial.publications) {
    const request=byRequest.get(publication.requestId);
    if(!request)continue;
    const expected=request.quality.internalSize;
    const quality=publication.quality;
    const sameIdentity=JSON.stringify(publication.identity)===JSON.stringify(request.identity);
    const correct=publication.internalSize?.width===expected.width&&publication.internalSize?.height===expected.height&&
      quality.iteration.maxIterations===request.quality.iteration.maxIterations&&quality.tracing.maxSteps===request.quality.tracing.maxSteps&&
      total(publication.rayTermination)===expected.width*expected.height&&sameIdentity;
    (correct?valid:invalid).push({publication,request});
  }
  const first=new Map();for(const entry of valid)if(!first.has(entry.request.identity.requestId))first.set(entry.request.identity.requestId,entry);
  const orbit=valid.filter(e=>e.request.phase==='orbit'&&e.publication.kind==='draft'&&e.publication.publishedAt<=trial.phases.orbit.start+workload.workloads.orbit.durationMs);
  const intervals=orbit.slice(1).map((e,i)=>e.publication.publishedAt-orbit[i].publication.publishedAt);
  const latencies=phase=>[...first.values()].filter(e=>e.request.phase===phase).map(e=>e.publication.publishedAt-e.request.createdAt);
  const settled=[...first.values()].find(e=>e.request.quality.profile==='settled'&&['orbit','after-orbit'].includes(e.request.phase));
  const full=settled&&valid.find(e=>e.request.identity.requestId===settled.request.identity.requestId&&e.publication.kind==='refinement'&&e.publication.samples===8&&e.publication.quality.lighting?.stage==='full');
  const completedDrafts=trial.reports.flatMap(report=>{
    const request=byRequest.get(report.requestId);
    if(!Number.isFinite(report.observedAt)||!Number.isFinite(report.timings?.completed)||!request||request.phase!=='orbit'||request.quality.profile!=='draft'||report.outcome!=='completed'||!report.completed||
       report.completed.width!==request.quality.internalSize.width||report.completed.height!==request.quality.internalSize.height||
       report.observedAt>trial.phases.orbit.start+workload.workloads.orbit.durationMs)return [];
    return [{requestId:report.requestId,createdAt:request.createdAt,reportedAt:report.observedAt,durationMs:report.observedAt-request.createdAt,completedMs:report.timings?.completed}];
  });
  const fullReport=settled&&trial.reports.find(r=>r.requestId===settled.request.identity.requestId&&r.outcome==='completed'&&r.completed?.samples===8&&r.completed.lighting?.stage==='full');
  const fullBeforeInteraction=Boolean(full&&fullReport&&full.publication.publishedAt<=trial.phases.interaction?.start&&fullReport.observedAt<=trial.phases.interaction.start);
  const reportsById=new Map(trial.reports.map(r=>[r.requestId,r]));
  const contenders=settled?trial.requests.filter(r=>r.quality.profile==='draft'&&r.phase==='orbit'&&r.createdAt<=settled.request.createdAt&&
    (!reportsById.has(r.identity.requestId)||reportsById.get(r.identity.requestId).observedAt>settled.request.createdAt)).map(r=>({requestId:r.identity.requestId,
      retiredAt:reportsById.get(r.identity.requestId)?.observedAt??null,outcome:reportsById.get(r.identity.requestId)?.outcome??'unavailable'})):[];
  const phaseTasks=trial.longTasks.filter(t=>Object.values(trial.phases).some(p=>t.startTime<p.end&&t.startTime+t.duration>p.start));
  const metrics={completedDrafts:completedDrafts.length,completedDraftsPerSecond:completedDrafts.length/(workload.workloads.orbit.durationMs/1000),
    completedDraftDurationsMs:completedDrafts.map(r=>r.durationMs),completedDraftReports:completedDrafts,
    readbacks:trial.reports.map(r=>({requestId:r.requestId,firstReadbackMs:r.timings?.readback??null,completedMs:r.timings?.completed??null,publishedMs:r.timings?.published??null,reportReceivedAt:r.observedAt})),
    settledContention:{draftsStillOutstandingAtSettledCreation:contenders.length,requests:contenders},fullQualityBeforeInteraction:fullBeforeInteraction,
    supersededStressInputs:Math.max(0,trial.issued.filter(i=>i.phase==='stress').length-latencies('stress').length),drafts:orbit.length,draftsPerSecond:orbit.length/(workload.workloads.orbit.durationMs/1000),draftIntervalP95Ms:p95(intervals),
    interactionP95Ms:p95(latencies('interaction')),stressMaxMs:latencies('stress').length?Math.max(...latencies('stress')):null,
    longestMainThreadTaskMs:phaseTasks.length?Math.max(...phaseTasks.map(t=>t.duration)):0,
    firstSettledMs:settled?settled.publication.publishedAt-settled.request.createdAt:null,fullQualityMs:full?full.publication.publishedAt-full.request.createdAt:null,
    publishedInteractionRequests:latencies('interaction').length,publishedStressRequests:latencies('stress').length,
    invalidPublications:invalid.length,phaseTasks,compositorTime:'unavailable'};
  const t=workload.targets;
  const targets=[
    {name:PERFORMANCE_PASSES[0],value:metrics.draftsPerSecond,limit:t.completedDraftsPerSecondMin,passed:metrics.draftsPerSecond>=t.completedDraftsPerSecondMin&&metrics.completedDraftsPerSecond>=t.completedDraftsPerSecondMin},
    {name:PERFORMANCE_PASSES[1],value:metrics.draftIntervalP95Ms,limit:t.consecutiveDraftIntervalP95Ms,passed:metrics.draftIntervalP95Ms!==null&&metrics.draftIntervalP95Ms<=t.consecutiveDraftIntervalP95Ms},
    {name:PERFORMANCE_PASSES[2],value:metrics.interactionP95Ms,limit:t.interactionP95Ms,passed:metrics.interactionP95Ms!==null&&metrics.interactionP95Ms<=t.interactionP95Ms},
    {name:PERFORMANCE_PASSES[3],value:metrics.stressMaxMs,limit:t.stressReplacementMs,passed:metrics.stressMaxMs!==null&&metrics.stressMaxMs<=t.stressReplacementMs},
    {name:PERFORMANCE_PASSES[4],value:metrics.longestMainThreadTaskMs,limit:t.applicationMainThreadTaskMaxMs,passed:trial.observerError?null:metrics.longestMainThreadTaskMs<=t.applicationMainThreadTaskMaxMs},
    {name:PERFORMANCE_PASSES[5],value:metrics.firstSettledMs,limit:t.firstSettledImageMs,passed:metrics.firstSettledMs!==null&&metrics.firstSettledMs<=t.firstSettledImageMs},
  ];
  return {metrics,targets,applicationFailure:invalid.length?'publication identity, quality or complete pixel coverage mismatch':!fullBeforeInteraction?'full quality did not complete before interaction':null};
}

export async function runPerformance({page,environment,sceneId,url,pass,report}) {
  const workloadBytes=await readFile('tests/reference/performance-workload.json'),workload=JSON.parse(workloadBytes);
  const predictionBytes=await readFile(workload.predictionArtifact.path),predictions=JSON.parse(predictionBytes);
  assert.equal(sha256(predictionBytes),workload.predictionArtifact.sha256);assert.equal(workload.readyForAcceptance,true);
  const selected=workload.scenes.find(s=>s.id===sceneId);assert.ok(selected,'frozen scene ID');
  assert.equal(environment.chromeGpu?.vendorId,0x10de,'physical NVIDIA adapter required');assert.match(environment.webgpuStatus,/Hardware accelerated/i);
  const outputDir=process.env.ATLAS_B15_REPORT_DIR??'docs/reports/project1b';
  const outputPath=`${outputDir}/1b1-performance-${sceneId}.json`,attempts=[];
  const result={schema:'atlas.performance-evidence',schemaVersion:1,sceneId,environment,workloadSha256:sha256(workloadBytes),predictionSha256:sha256(predictionBytes),attempts};
  const persist=async()=>{for(const attempt of attempts)attempt.classification=classifyAttempt(attempt);result.classification=classifyTrials(attempts);await mkdir(outputDir,{recursive:true});await writeFile(outputPath,JSON.stringify(result,null,2)+'\n');};
  await page.addInitScript(installObservation);
  await page.goto(url,{timeout:LIMITS.launch});await page.waitForFunction(()=>Boolean(globalThis.atlas?.space));
  await ev(page,source=>{globalThis.__p3Schedule=(0,eval)(`(${source})`);},scheduleAbsolute.toString(),'install absolute timer');
  const idle=()=>ev(page,()=>atlas.space.whenIdle({timeoutMs:115000}),undefined,'P3 drain',LIMITS.deep);
  const restore=async scene=>{await ev(page,scene=>{const result=atlas.space.openSceneText(JSON.stringify(scene));if(result?.ok===false)throw Error(result.error);},scene,'restore frozen scene');await idle();};
  try {
    await ev(page,async()=>{const result=await atlas.workspaces.switchTo('space');if(result.activeId!=='space')throw Error(JSON.stringify(result));},undefined,'activate Space',LIMITS.deep);
    await idle(); result.prewarm=await ev(page,()=>atlas.space.state.prewarm,undefined,'prewarm');
    for(let index=0;index<workload.trials.maxAttempts;index++) {
      await restore(selected.scene);await ev(page,startAttempt,undefined,'begin trial');
      const attempt={index:index+1,complete:false,coverage:false};attempts.push(attempt);await persist();
      try {
        await ev(page,timedCamera,{phase:'orbit',poses:workload.workloads.orbit.cameraPoses[sceneId]},'P3 orbit',LIMITS.deep);
        await ev(page,()=>{__p3.phases['settled-after-orbit']={start:performance.now()};},undefined,'settled phase start');
        await idle(); // Includes full quality before interaction; request clock is never restarted.
        await ev(page,()=>{
          __p3.phases['settled-after-orbit'].end=performance.now();
          const settled=__p3.requests.find(r=>r.quality.profile==='settled'&&['orbit','after-orbit'].includes(r.phase));
          const full=settled&&__p3.publications.some(p=>p.requestId===settled.identity.requestId&&p.kind==='refinement'&&p.samples===8&&p.quality.lighting?.stage==='full');
          const complete=settled&&__p3.reports.some(r=>r.requestId===settled.identity.requestId&&r.outcome==='completed'&&r.completed?.samples===8&&r.completed.lighting?.stage==='full');
          if(!full||!complete){__p3.applicationFailure='full quality did not complete before interaction';throw Error(__p3.applicationFailure);}
        },undefined,'settled full-quality prerequisite');
        await ev(page,timedCamera,{phase:'interaction',poses:workload.workloads.interaction.cameraPoses[sceneId]},'P3 interaction',LIMITS.deep);
        await idle();
        await ev(page,timedStress,{alternation:workload.workloads.stress.alternations[sceneId],...workload.workloads.stress.editRule,durationMs:workload.workloads.stress.durationMs},'P3 stress',LIMITS.deep);
        await idle();
        attempt.complete=true;
      } catch(error) {attempt.error=String(error.stack??error);}
      // Persist all issued inputs, reports and timing diagnostics even on failure.
      let trial;
      try {trial=await ev(page,async()=>{await new Promise(r=>setTimeout(r,0));const t=__p3;t.stop.forEach(fn=>fn());const {stop,...data}=t;return {...data,longTasks:__p3LongTasks,observerError:globalThis.__p3ObserverError??null,memory:atlas.space.backendDiagnostics};},undefined,'collect trial evidence');}
      catch(error){attempt.evidenceError=String(error.stack??error);await persist();break;}
      Object.assign(attempt,{trial,applicationFailure:trial.applicationFailure??null,timing:{invalidated:trial.timings.some(t=>t.invalidated),rearms:trial.timings.reduce((sum,t)=>sum+t.rearms,0)}});
      if(attempt.complete)Object.assign(attempt,measureAttempt(trial,workload));
      else {
        // A known application terminal failure is not excused as a harness issue.
        const failed=trial.reports.find(r=>['failed','budget-exceeded','interrupted'].includes(r.outcome));
        if(failed)attempt.applicationFailure=`application ${failed.outcome}: ${failed.reason}`;
      }
      const terminalFailure=trial.reports.find(r=>['failed','budget-exceeded','interrupted'].includes(r.outcome));
      if(terminalFailure)attempt.applicationFailure=`application ${terminalFailure.outcome}: ${terminalFailure.reason}`;
      await persist();
      await finishAttemptEvidence(attempt, async()=>{
        const coverage=[];attempt.checkpoints=coverage;
        for(const checkpoint of workload.coverageCheckpoints.materialized[sceneId]) {
          const other=workload.workloads.orbit.cameraPoses[sceneId][checkpoint.orbitIndex===0?625:0].camera;
          const replay={...selected.scene,camera:other,appearance:{...selected.scene.appearance,lightingQuality:'direct'},sampling:{...selected.scene.sampling,targetSamples:1}};
          await restore(replay);
          await ev(page,async checkpoint=>{
            globalThis.__p3Replay=null;let requestId=null;
            const stopRequest=atlas.space.onRequest(event=>{if(!requestId&&event.purpose==='interactive')requestId=event.identity.requestId;});
            const unsubscribe=atlas.space.onPublish(publication=>{if(publication.requestId===requestId) {__p3Replay=publication;unsubscribe();stopRequest();}});
            atlas.space.requestCamera(checkpoint.camera,{phase:checkpoint.kind==='orbit'?'preview':'commit'});
          },checkpoint,'replay checkpoint');
          await page.waitForFunction(()=>Boolean(globalThis.__p3Replay),undefined,{timeout:LIMITS.deep});
          const publication=await ev(page,()=>__p3Replay,undefined,'checkpoint publication');
          const expected=predictions.checkpoints.find(p=>p.id===checkpoint.predictionId),counts=coverageCounts(publication.rayTermination);
          const checked={id:checkpoint.id,counts,expected:expected.acceptance,passed:total(publication.rayTermination)===expected.rays&&Object.entries(expected.acceptance.ranges).every(([key,[lo,hi]])=>counts[key]>=lo&&counts[key]<=hi)};
          if(checkpoint.kind==='settled') {
            await idle();
            await mkdir('artifacts/performance',{recursive:true});const screenshot=`artifacts/performance/${sceneId}-attempt-${index+1}-settled-first.png`;
            const png=await within(page.locator('#space-canvas').screenshot({path:screenshot}),LIMITS.operation,'visible settled-first screenshot');
            const visible=await ev(page,async base64=>{
              const blob=await(await fetch(`data:image/png;base64,${base64}`)).blob(),bitmap=await createImageBitmap(blob),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d');context.drawImage(bitmap,0,0);
              const data=context.getImageData(0,0,bitmap.width,bitmap.height).data,colors=new Set();for(let i=0;i<data.length;i+=4)colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);bitmap.close();return {width:canvas.width,height:canvas.height,distinctColors:colors.size};
            },png.toString('base64'),'independent screenshot pixels');
            checked.visible={...visible,path:screenshot,sha256:sha256(png)};checked.passed&&=visible.width===1280&&visible.height===720&&visible.distinctColors>1;
          }
          coverage.push(checked);
          if(!checked.passed)attempt.applicationFailure='frozen checkpoint coverage or visible-output check failed';
          await persist();if(!checked.passed)break;
        }
        attempt.coverage=coverage.length===5&&coverage.every(row=>row.passed);
        if(!attempt.coverage)attempt.applicationFailure='frozen checkpoint coverage or visible-output check failed';
      }, persist);
      if(attempt.classification.state==='failed'||classifyTrials(attempts).state==='passed')break;
    }
    await persist();report.push({name:'P3 per-attempt evidence',path:outputPath,...result});
    assert.equal(result.classification.state,'passed',JSON.stringify(result.classification));
    for(const name of PERFORMANCE_PASSES)pass(name,{sceneId,attempts:attempts.map(a=>({index:a.index,classification:a.classification,metrics:a.metrics}))});
  } finally {await persist();}
}


export async function finishAttemptEvidence(attempt, replay, persist) {
  try {
    if(attempt.complete&&classifyAttempt(attempt).state!=='failed')await replay();
    else attempt.replaySkipped=attempt.complete?'established application failure':'incomplete workload';
  } catch(error) {
    attempt.coverage=false;attempt.coverageError=String(error.stack??error);
    if(error.code==='ERR_ASSERTION')attempt.applicationFailure='frozen checkpoint assertion failed';
  } finally {attempt.classification=classifyAttempt(attempt);await persist();}
}
