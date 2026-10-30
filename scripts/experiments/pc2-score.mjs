import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.argv[2]),report=JSON.parse(await fs.readFile(path.join(root,'browser.json'),'utf8'));
const quantile=(values,p)=>{if(!values.length)return null;const a=[...values].sort((a,b)=>a-b);return a[Math.min(a.length-1,Math.ceil(p*a.length)-1)];};
const stats=values=>({n:values.length,p50:quantile(values,.5),p95:quantile(values,.95),p99:quantile(values,.99),max:values.length?Math.max(...values):null});
const fps=frames=>frames.length?1000*frames.length/frames.reduce((sum,f)=>sum+f.ms,0):null;
const runs=report.runs.map(run=>{
 const entries=run.events.filter(e=>e.type==='entry'),ready=run.events.filter(e=>e.type==='ready'),contacts=run.events.filter(e=>e.type==='contact'),frames=run.frames;
 const navigation={};for(const kind of ['coarse','fine'])for(const phase of ['first','steady'])navigation[kind+'-'+phase]=stats(run.nav.filter(n=>(n.kind===kind||(kind==='coarse'&&n.kind==='empty-air'))&&(phase==='first'?n.first:!n.first)).map(n=>n.ms));
 const coarseNav=stats(run.nav.filter(n=>n.kind!=='fine').map(n=>n.ms));
 const elapsedS=(run.ended-run.started)/1000;
 return{scenario:run.scenario,elapsedS,frames:frames.length,fps:fps(frames),preparationFps:fps(frames.filter(f=>f.pending)),frameMs:stats(frames.map(f=>f.ms)),navMs:stats(run.nav.map(n=>n.ms)),navigation,coarseNav,
  readinessMs:{interaction:stats(ready.filter(e=>e.kind!=='view').map(e=>e.readinessMs)),view:stats(ready.filter(e=>e.kind==='view').map(e=>e.readinessMs))},
  ready:ready.length,entries:entries.length,nonzeroK:entries.some(e=>e.addressKey!=='fine'&&e.address[2]!==0),upD:Math.max(...frames.map(f=>(f.position[1]-report.setup.fixture.grid.origin[1])/report.setup.fixture.grid.diameter)),downwardTravel:frames.some((f,i)=>i&&f.position[1]<frames[i-1].position[1]-1e-6),
  contacts:{coarse:contacts.filter(e=>e.addressKey!=='fine').length,fine:contacts.filter(e=>e.addressKey==='fine').length},fineVisits:run.events.filter(e=>e.type==='scale'&&e.bodyD===report.setup.fixture.grid.diameter/4).length,growths:run.events.filter(e=>e.type==='scale'&&e.bodyD===report.setup.fixture.grid.diameter).length,cycles:run.final.cycle,
  unsafeGrowthRefusals:run.events.filter(e=>e.type==='unsafe-growth-refused').length,waitMs:run.final.waitMs,retirements:run.final.retirements,peakInteraction:run.peakInteraction,peakGpuBytes:run.peakGpuBytes,
  revisionAgreement:frames.every(f=>f.renderRevision===f.collisionRevision),scaleDisplacementMax:Math.max(0,...run.events.filter(e=>e.type==='scale').map(e=>e.displacement)),errors:run.errors};
});
const events=report.browserCleanup?.events??[],transfers=events.filter(e=>e.type==='transfer-ready'),consumers=events.filter(e=>e.type==='consumer-prepared');
const result={mode:report.mode,cleanup:report.cleanup,failure:report.failure??null,runs,phaseMs:Object.fromEntries(['normalsMs','collisionMs','restoreMs','warmupMs','uploadMs'].map(key=>[key,stats(consumers.map(e=>e.timings[key]))])),
 nativeMs:{total:stats(transfers.map(e=>e.native.timings.nativeReady-e.native.timings.nativeStart)),structural:stats(transfers.map(e=>e.native.timings.structuralMs)),constructionAndExport:stats(transfers.map(e=>e.native.timings.nativeReady-e.native.timings.nativeStart-e.native.timings.structuralMs))},
 navigationLimit:'The coarse-first bucket includes constant-air decisions (which create no collision world). Fine-first means first movement cast after the explicitly timed preparation warmup. Do not call either an un-warmed post-restore distribution.',
 resource:{peakOwnedRssMiB:report.processes.peakRssKiB/1024,peakMainWasmCapacity:Math.max(0,...consumers.map(e=>e.timings.mainWasmCapacity)),peakWorkerWasmCapacity:Math.max(0,...consumers.map(e=>e.timings.workerWasmCapacity)),regionOwnerTotal:'unverified; allocator/live native arrays and driver allocations incomplete'},inputChecks:report.inputChecks??null};
await fs.writeFile(path.join(root,'score.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
