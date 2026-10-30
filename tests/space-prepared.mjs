// BI1.A1 final application route and lifecycle controls. Headed hardware only.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { createApplicationServer } from '../scripts/preparation/application-server.mjs';
import { createStaticHandler } from '../scripts/static-handler.mjs';
import { observeOwnedProcesses } from '../scripts/preparation/process-observer.mjs';
import { within, ev, boundContext, closeWithin, chromeLaunchEnv, installSuiteDeadline } from './support/bounded.mjs';
import { PROJECT0_LAUNCH_ARGS, checkEffectiveArguments, collectVisibleText, activeGpuIdentity } from './support/space-suite.mjs';

if(!process.env.ATLAS_GPU_HANDOFF||process.env.ATLAS_GPU_DEFERRED)throw Error('Prepared-world acceptance requires an explicit hardware handoff');
installSuiteDeadline('space-prepared',300000);
const exec=promisify(execFile),stamp=new Date().toISOString().replace(/[:.]/g,'-'),root=process.env.ATLAS_PREPARED_RUN_ROOT??'/mnt/ml_storage/scratch/atlas-pc3/application-'+stamp;
if(!path.resolve(root).startsWith('/mnt/ml_storage/scratch/atlas-pc3/'))throw Error('PC3 evidence root required');await fs.mkdir(root);
const report=[],detail={started:Date.now(),mode:'application',errors:[],runs:[],controls:[],cleanup:false},observer=observeOwnedProcesses();
let browser,context,page,service,plainServer;const allEvents=[];
const pass=(name,data={})=>{report.push({name,...data});console.log('PASS '+name);};
const delay=ms=>within(new Promise(resolve=>setTimeout(resolve,Math.max(0,ms))),Math.max(0,ms)+2000,'fixed application interval');
const state=()=>ev(page,()=>atlas.landscape.state);
const worldPosition=s=>s.pose.originM.map((x,i)=>x+s.pose.positionLocalM[i]);
const difference=(a,b)=>a.map((x,i)=>x-b[i]);
const snapshot=async label=>{const value=await state();detail.observations??=[];detail.observations.push({label,time:Date.now(),...value});return value;};
async function enterLandscape(){
 await page.click('#switch-space');await page.waitForFunction(()=>atlas.workspaces.current()==='space'&&!atlas.workspaces.pending(),{},{timeout:60000});
 if((await ev(page,()=>atlas.spaceModes.state.selected))!=='landscape')await page.click('#space-mode-landscape');
 await page.waitForFunction(()=>atlas.landscape.state.active||!atlas.spaceModes.state.pending&&document.querySelector('#space-mode-error').textContent,{},{timeout:60000});
 const s=await state();assert.equal(s.active,true,await ev(page,()=>document.querySelector('#space-mode-error').textContent));return s;
}
async function leavePlane(){await page.click('#switch-plane');await page.waitForFunction(()=>atlas.workspaces.current()==='plane'&&!atlas.workspaces.pending());await ev(page,()=>atlas.landscape.whenReleased(),null,'prepared release',30000);}
async function press(key,ms){await page.keyboard.down(key);try{await delay(ms);}finally{await page.keyboard.up(key);}}
async function flyTo(target,{bound=15000,stopFraction=.025}={}){
 const began=Date.now();let s=await state();
 while(Date.now()-began<bound){const delta=difference(target,worldPosition(s)),distance=Math.hypot(...delta);if(distance<=stopFraction*s.pose.bodyDiameterM)return s;
  await ev(page,v=>atlas.landscape.look(Math.atan2(v[0],v[2]),Math.asin(v[1]/Math.hypot(...v))),delta);
  const pulse=Math.max(20,Math.min(120,(distance-stopFraction*s.pose.bodyDiameterM)*1000/(.5*s.pose.bodyDiameterM)));
  await press('w',pulse);s=await state();if(!s.active)throw Error('Landscape became unavailable while flying');
 }throw Error('Actual-key flight did not reach its bounded target');
}
async function collectEvents(){const value=await ev(page,()=>atlas.landscape.events());allEvents.length=0;allEvents.push(...value);return value;}
try{
 service=await createApplicationServer({runRoot:root});browser=await chromium.launch({channel:'chrome',headless:false,chromiumSandbox:true,timeout:30000,env:chromeLaunchEnv(),args:['--disable-dev-shm-usage',...PROJECT0_LAUNCH_ARGS]});
 context=boundContext(await browser.newContext({viewport:{width:1280,height:720}}));const identity=await context.newPage();await identity.goto('chrome://version');
 const arguments_=checkEffectiveArguments(await ev(identity,()=>document.querySelector('#command_line').textContent),PROJECT0_LAUNCH_ARGS);assert.ok(!arguments_.headless&&!arguments_.noSandbox&&!arguments_.gpuWatchdogDisabled&&!arguments_.missing.length);
 await identity.goto('chrome://gpu');let text='';for(let i=0;i<20;i++){text=await ev(identity,collectVisibleText);if(/NVIDIA.*RTX|RTX.*NVIDIA/.test(text))break;await delay(250);}const gpu=activeGpuIdentity(text);assert.equal(gpu.vendorId,0x10de);pass('Prepared application uses the maintained headed hardware profile',{arguments:arguments_,gpu});await closeWithin(identity,'identity page');
 page=await context.newPage();page.on('pageerror',error=>detail.errors.push(error.stack??error.message));await page.goto('http://127.0.0.1:5196/');await page.waitForFunction(()=>window.atlas?.workspaces);
 detail.initialPlane=await ev(page,()=>atlas.scene);const initial=await enterLandscape(),D=initial.metadata.grid.diameter,O=initial.metadata.grid.origin,n=initial.metadata.grid.axes[2];detail.setup={fixture:initial.metadata,adapter:initial.adapter};
 const routeStart=Date.now(),startEvent=(await collectEvents()).length;
 await press('e',2400);const up=await snapshot('up');assert.ok(up.pose.positionLocalM[1]>.2*D);
 const tangent=initial.metadata.grid.axes[0];await ev(page,v=>atlas.landscape.look(Math.atan2(v[0],v[2]),Math.asin(v[1])),tangent);await press('w',1200);const out=await snapshot('lateral');await press('s',1200);const back=await snapshot('reverse');assert.ok(difference(worldPosition(back),worldPosition(out)).reduce((sum,x,i)=>sum+x*tangent[i],0)<-.1*D);
 await flyTo(O,{bound:15000});await snapshot('home-after-descent');
 const entry=initial.metadata.approach.entry;await flyTo(entry,{bound:10000});await page.mouse.move(600,400);await page.mouse.wheel(0,-120);
 await page.waitForFunction(()=>atlas.landscape.state.pose.bodyDiameterM===atlas.landscape.state.metadata.grid.diameter/4,{},{timeout:10000});
 await flyTo(initial.metadata.approach.inspection,{bound:10000});await page.screenshot({path:path.join(root,'fine-inspection.png')});
 const direction=difference(initial.metadata.approach.target,worldPosition(await state()));await ev(page,v=>atlas.landscape.look(Math.atan2(v[0],v[2]),Math.asin(v[1]/Math.hypot(...v))),direction);
 const contactsBefore=(await collectEvents()).filter(e=>e.type==='contact').length;await press('w',800);const contact=await snapshot('fine-contact');assert.ok((await collectEvents()).filter(e=>e.type==='contact').length>contactsBefore);
 await page.mouse.wheel(0,120);await delay(150);assert.equal((await state()).pose.bodyDiameterM,D/4);
 await flyTo(entry.map((x,i)=>x+.025*D*n[i]),{bound:10000});await page.click('#landscape-larger');await page.waitForFunction(()=>atlas.landscape.state.pose.bodyDiameterM===atlas.landscape.state.metadata.grid.diameter);await flyTo(O,{bound:10000});
 const retained=await snapshot('route-return');await page.click('#space-mode-viewer');await page.waitForFunction(()=>atlas.spaceModes.state.selected==='viewer'&&!atlas.spaceModes.state.pending);
 await page.click('#space-mode-landscape');await page.waitForFunction(()=>atlas.landscape.state.active);assert.deepEqual((await state()).pose,retained.pose);
 await leavePlane();assert.deepEqual(await ev(page,()=>atlas.scene),detail.initialPlane);await enterLandscape();assert.deepEqual((await state()).pose,retained.pose);
 const seconds=(Date.now()-routeStart)/1000;assert.ok(seconds<=90,'Real-input route exceeded90seconds');const routeEvents=(await collectEvents()).slice(startEvent);
 assert.ok(routeEvents.some(e=>e.type==='entry'&&e.address?.[2]!==0&&e.addressKey!=='fine'));
 detail.runs.push({scenario:'application-route',started:routeStart,ended:Date.now(),events:routeEvents,frames:routeEvents.filter(e=>e.type==='frame'),errors:[],final:await state(),seconds,contactPose:contact.pose});
 pass('Application landscape route demonstrates 3D contact scale and retained return',{seconds});

 await leavePlane();const rapidStart=Date.now(),rapidIndex=(await collectEvents()).length;
 for(let i=0;i<2;i++){await page.click('#switch-space');await delay(100);await page.click('#switch-plane');await delay(100);}
 assert.ok(Date.now()-rapidStart<1000);await page.click('#switch-space');await page.waitForFunction(()=>atlas.workspaces.current()==='space'&&!atlas.workspaces.pending(),{},{timeout:25000});assert.equal((await state()).active,true);
 await delay(30000-(Date.now()-rapidStart));const rapidEvents=(await collectEvents()).slice(rapidIndex),deactivated=new Set();
 for(const e of rapidEvents){if(e.type==='deactivated')deactivated.add(e.runtimeId);if(e.type==='first-presented')assert.ok(!deactivated.has(e.runtimeId),'Stale activation presented');}
 detail.controls.push({scenario:'rapid-switch',started:rapidStart,ended:Date.now(),events:rapidEvents});pass('Rapid switches suppress stale landscape publication and input');

 await leavePlane();const pendingStart=Date.now(),pendingIndex=(await collectEvents()).length;let hold=true,resolveFetched,rejectFetched;const held=new Set(),fetched=new Promise((resolve,reject)=>{resolveFetched=resolve;rejectFetched=reject;});
 const handler=route=>{const task=(async()=>{const selected=hold;if(selected)hold=false;try{if(!selected){await route.continue();return;}const response=await route.fetch({timeout:10000});assert.equal(response.status(),200);detail.pendingResponse={status:response.status(),fetchedAt:Date.now()};resolveFetched();await delay(1500);await route.fulfill({response});}catch(error){if(selected&&!detail.pendingResponse)rejectFetched(error);else detail.expectedCancelledResponse=error.message;}})();held.add(task);task.then(()=>held.delete(task),()=>held.delete(task));return task;};
 await page.route('**/api/preparation/prepare',handler);await page.click('#switch-space');await page.waitForFunction(()=>atlas.landscape.state.runtime?.pending.length>0,{},{timeout:15000});await within(fetched,15000,'held native preparation response');assert.ok(service.snapshot().native.publications>0);await leavePlane();detail.pendingResponse.closedAt=Date.now();await page.unroute('**/api/preparation/prepare',handler);await Promise.allSettled([...held]);
 assert.equal(service.snapshot().native.publications,0);await enterLandscape();assert.deepEqual((await state()).pose,retained.pose);await delay(30000-(Date.now()-pendingStart));
 detail.controls.push({scenario:'leave-pending',started:pendingStart,ended:Date.now(),events:(await collectEvents()).slice(pendingIndex)});pass('Leaving during pending native work retires the old client before re-entry');
 await page.screenshot({path:path.join(root,'application.png')});await leavePlane();await collectEvents();

 plainServer=http.createServer(createStaticHandler({root:process.cwd()}));await new Promise((resolve,reject)=>{plainServer.once('error',reject);plainServer.listen(5197,'127.0.0.1',resolve);});
 const missing=await context.newPage(),missingStart=Date.now();missing.on('pageerror',error=>detail.errors.push(error.message));await missing.goto('http://127.0.0.1:5197/');await missing.waitForFunction(()=>window.atlas?.workspaces);await ev(missing,()=>atlas.workspaces.switchTo('space'),null,'ordinary Space activation',60000);
 await missing.click('#space-mode-landscape');await missing.waitForFunction(()=>!atlas.spaceModes.state.pending&&document.querySelector('#space-mode-error').textContent.includes('npm run dev:world'));
 assert.equal(await ev(missing,()=>atlas.workspaces.current()),'space');assert.equal(await ev(missing,()=>atlas.spaceModes.state.selected),'viewer');await missing.click('#switch-plane');await missing.waitForFunction(()=>atlas.workspaces.current()==='plane');await delay(20000-(Date.now()-missingStart));await closeWithin(missing,'missing-helper page');pass('Missing preparation falls back inside Space and preserves Plane access');
 const foreign=await fetch('http://127.0.0.1:5196/api/preparation/open',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify({runtimeId:'foreign-client'})});assert.equal(foreign.status,403);assert.equal((await fetch('http://127.0.0.1:5196/tests/fixtures/pc2/index.html')).status,403);pass('Preparation endpoints reject foreign origins and private paths stay blocked');
 assert.equal(detail.errors.length,0,detail.errors.join('\n'));assert.ok(!allEvents.some(e=>['workspace-error','runtime-error','cleanup-error','device-error'].includes(e.type)));
 detail.events=allEvents;detail.pass=true;
}catch(error){detail.failure=String(error.stack??error);report.push({name:'FAIL',error:detail.failure});console.error(detail.failure);process.exitCode=1;if(page)await page.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});}
finally{
 const errors=[];try{if(page)await ev(page,async()=>{if(window.atlas?.landscape){await atlas.workspaces.switchTo('plane');await atlas.landscape.whenReleased();}},null,'application drain',30000);}catch(error){errors.push(error.message);}
 try{if(page)await collectEvents();await observer.sample();await closeWithin(context,'prepared context');await closeWithin(browser,'installed Chrome');}catch(error){errors.push(error.message);}
 try{if(service)detail.serverCleanup=await service.close();if(plainServer){plainServer.closeAllConnections();await new Promise(resolve=>plainServer.close(resolve));}}catch(error){errors.push(error.message);}
 detail.processes=await observer.stop();detail.cleanupErrors=errors;detail.cleanup=!errors.length&&!detail.processes.alive.length&&!detail.processes.errors.length&&detail.serverCleanup?.cleanup===true;
 detail.hello=detail.serverCleanup?.hello;detail.browserCleanup={events:allEvents};detail.ended=Date.now();await fs.writeFile(path.join(root,'browser.json'),JSON.stringify(detail,null,2)+'\n');
 if(detail.pass&&detail.cleanup){
  try{
   const options={cwd:process.cwd(),timeout:120000,maxBuffer:4*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}};
   await exec(process.execPath,['scripts/experiments/pc2-qualification-input.mjs',root,'browser.json'],options);
   await exec('/mnt/ml_storage/scratch/venvs/gpu/bin/python',['scripts/experiments/pc2-qualify.py',root],options);
   await exec('/mnt/ml_storage/scratch/venvs/gpu/bin/python',['scripts/experiments/pc2-buffer-audit.py',root],options);
   await exec('/mnt/ml_storage/scratch/venvs/gpu/bin/python',['scripts/experiments/pc2-audit.py',root],options);
   pass('Finite delivered-geometry qualification and actual application flight checks pass');
  }catch(error){detail.failure=error.stderr??error.message;report.push({name:'FAIL',error:detail.failure});process.exitCode=1;}
 }
 if(detail.cleanup&&!detail.failure)pass('Prepared application has no runtime errors and confirms owned cleanup');
 else if(!detail.cleanup){report.push({name:'FAIL',error:'CLEANUP-UNCONFIRMED'});process.exitCode=125;}
 detail.sources={};for(const filename of ['src/app.js','index.html','src/ui/style.css','src/space/mode-host.js','src/space/preparation/workspace.js','src/space/preparation/runtime.js','src/space/preparation/pose.js','src/space/preparation/application-client.js','src/space/preparation/browser-producer.js','src/space/preparation/browser-preparer.js','src/space/preparation/collision-worker.js','src/preparation-bootstrap.js','src/preparation-worker.js','src/space/render/webgpu/prepared-regions.js','scripts/preparation/application-server.mjs','scripts/preparation/application-policy.mjs','scripts/preparation/native-adapter.mjs','scripts/preparation/native-worker.py','tests/space-prepared.mjs'])detail.sources[filename]=createHash('sha256').update(await fs.readFile(filename)).digest('hex');
 await fs.writeFile(path.join(root,'browser.json'),JSON.stringify(detail,null,2)+'\n');await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/space-prepared-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({root,pass:detail.pass&&!detail.failure,cleanup:detail.cleanup,failure:detail.failure}));
}
