import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.argv[2]),data=JSON.parse(await fs.readFile(path.join(root,'browser.json'),'utf8'));
const optional=async name=>{try{return JSON.parse(await fs.readFile(path.join(root,name),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};
const stats=values=>{const a=[...values].sort((x,y)=>x-y),q=p=>a.length?a[Math.min(a.length-1,Math.ceil(p*a.length)-1)]:null;return{n:a.length,p50:q(.5),p95:q(.95),p99:q(.99),max:q(1)};};
const fps=frames=>frames.length?1000*frames.length/frames.reduce((sum,e)=>sum+e.ms,0):null;
const route=data.runs.map(run=>{
 const frames=run.frames,nav=run.events.filter(e=>e.type==='navigation'),ready=run.events.filter(e=>e.type==='ready'),body=ready.filter(e=>e.kind!=='view');
 const occupiedMs=frames.reduce((sum,e)=>sum+e.ms,0),waitMs=frames.filter(e=>e.waiting).reduce((sum,e)=>sum+e.ms,0);
 return{scenario:run.scenario,seconds:run.seconds,frames:frames.length,fps:fps(frames),preparationFps:fps(frames.filter(e=>e.pending)),frameMs:stats(frames.map(e=>e.ms)),navigationMs:stats(nav.map(e=>e.ms)),
  navigationByClass:Object.fromEntries(['constant','first-surface','steady-surface'].map(kind=>[kind,stats(nav.filter(e=>kind==='constant'?e.classification&&e.classification!=='surface':e.classification==='surface'&&(kind==='first-surface'?e.firstSurface:!e.firstSurface)).map(e=>e.ms))])),
  readinessMs:{interaction:stats(body.map(e=>e.readinessMs)),view:stats(ready.filter(e=>e.kind==='view').map(e=>e.readinessMs))},waitMs,waitFraction:occupiedMs?waitMs/occupiedMs:null,
  contacts:run.events.filter(e=>e.type==='contact').length,fineEntries:run.events.filter(e=>e.type==='scale'&&e.bodyD===data.setup.fixture.grid.diameter/4).length,growths:run.events.filter(e=>e.type==='scale'&&e.bodyD===data.setup.fixture.grid.diameter).length,
  revisionAgreement:frames.every(e=>e.renderRevision===e.collisionRevision),maxInteraction:Math.max(0,...frames.map(e=>e.ownedInteraction)),maxView:Math.max(0,...frames.map(e=>e.ownedView)),peakGpuBytes:Math.max(0,...frames.map(e=>e.gpuBytes))};
});
const events=data.browserCleanup?.events??[],consumers=events.filter(e=>e.type==='consumer-prepared'),q=await optional('qualification.json'),audit=await optional('flight-audit.json'),buffers=await optional('buffer-audit.json');
const result={pass:data.pass&&!data.failure,cleanup:data.cleanup,failure:data.failure??null,route,controls:data.controls.map(c=>({scenario:c.scenario,seconds:(c.ended-c.started)/1000,firstPresentations:c.events.filter(e=>e.type==='first-presented').length,cancellations:c.events.filter(e=>e.type==='deactivated').length})),
 qualification:q&&{pass:q.pass,specimens:q.specimens,elapsedS:q.elapsedS},flightAudit:audit&&{pass:audit.pass,scope:audit.scope,runs:audit.runs.map(r=>({scenario:r.scenario,entries:r.entries.length,contacts:r.contacts.length,waitingFramesStationary:r.waitingFramesStationary,checkedFrames:r.checkedFrames}))},bufferAudit:buffers,
 phases:Object.fromEntries(['normalsMs','collisionMs','restoreMs','warmupMs','uploadMs'].map(name=>[name,stats(consumers.map(e=>e.timings[name]))])),
 resources:{peakOwnedRssMiB:data.processes.peakRssKiB/1048576*1024,mainWasmCapacity:Math.max(0,...consumers.map(e=>e.timings.mainWasmCapacity)),workerWasmCapacity:Math.max(0,...consumers.map(e=>e.timings.workerWasmCapacity)),attributableRegionMemory:'unverified; allocator/driver attribution incomplete'},
 scope:'BI1.A1 application entry, prepared movement and in-memory retained pose. Active-world frame statistics exclude initial activation; startup/readiness are separate. No saved scene/history UI, abrupt-client expiry, device-loss parity or production backend claim.'};
await fs.writeFile(path.join(root,'score.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({root,pass:result.pass,cleanup:result.cleanup,route:result.route,qualification:result.qualification?.pass,flightAudit:result.flightAudit?.pass},null,2));
