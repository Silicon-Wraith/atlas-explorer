// PC4 production-duration session ownership controls; headed hardware only.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { createApplicationServer } from '../scripts/preparation/application-server.mjs';
import { observeOwnedProcesses } from '../scripts/preparation/process-observer.mjs';
import { runOwnedPreview } from '../scripts/world-preview.mjs';
import { createSessionLossProxy } from './support/session-loss-proxy.mjs';
import { within, ev, boundContext, closeWithin, chromeLaunchEnv, installSuiteDeadline } from './support/bounded.mjs';
import { PROJECT0_LAUNCH_ARGS, checkEffectiveArguments, collectVisibleText, activeGpuIdentity } from './support/space-suite.mjs';

if(!process.env.ATLAS_GPU_HANDOFF||process.env.ATLAS_GPU_DEFERRED)throw Error('Explicit headed hardware handoff required');
installSuiteDeadline('space-preparation-session',300000);
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),root=path.resolve(process.env.ATLAS_SESSION_RUN_ROOT??'/mnt/ml_storage/scratch/atlas-pc4/session-'+stamp);
assert.ok(root.startsWith('/mnt/ml_storage/scratch/atlas-pc4/'));await fs.mkdir(root);
const report=[],detail={started:Date.now(),mode:'session',errors:[],runs:[],controls:[],cleanup:false},observer=observeOwnedProcesses(),exec=promisify(execFile);
let service,lossProxy,browser,context,a,b,aId,bId,aHeaders,heldToken,savedA=[],suppressB=false,holdFine=true,heldReady,heldTask;
const held=new Promise(resolve=>{heldReady=resolve;}),base='http://127.0.0.1:5198',allEvents=[];
const pass=(name,extra={})=>{report.push({name,...extra});console.log('PASS '+name);};
const delay=ms=>within(new Promise(resolve=>setTimeout(resolve,Math.max(0,ms))),Math.max(1,ms)+2000,'fixed session interval');
async function until(check,ms,label){const end=Date.now()+ms;while(Date.now()<end){const result=await check();if(result)return result;await delay(100);}throw Error(label+' exceeded '+ms+'ms');}
const state=page=>ev(page,()=>atlas.landscape.state);
const events=page=>ev(page,()=>atlas.landscape.events());
async function ready(page,ms=60000){await page.waitForFunction(()=>atlas.landscape.state.active&&atlas.landscape.state.payload?.session?.verified,null,{timeout:ms});}
async function enter(page){await page.click('#switch-space');await page.waitForFunction(()=>atlas.workspaces.current()==='space'&&!atlas.workspaces.pending(),null,{timeout:60000});if(await ev(page,()=>atlas.spaceModes.state.selected)!=='landscape')await page.click('#space-mode-landscape');await ready(page);}
async function press(page,key,ms){await page.keyboard.down(key);try{await delay(ms);}finally{await page.keyboard.up(key);}}
const apiHeaders=raw=>({'Content-Type':'application/json',Origin:base,'X-Atlas-Client':raw['x-atlas-client'],'X-Atlas-Session':raw['x-atlas-session']});
try{
 service=await createApplicationServer({runRoot:root,port:5198});
 lossProxy=await createSessionLossProxy(base);detail.lossProxyOrigin=lossProxy.origin;
 browser=await chromium.launch({channel:'chrome',headless:false,chromiumSandbox:true,timeout:30000,env:chromeLaunchEnv(),args:['--disable-dev-shm-usage',...PROJECT0_LAUNCH_ARGS]});
 context=boundContext(await browser.newContext({viewport:{width:1280,height:720}}));
 const identity=await context.newPage();await identity.goto('chrome://version');
 detail.arguments=checkEffectiveArguments(await ev(identity,()=>document.querySelector('#command_line').textContent),PROJECT0_LAUNCH_ARGS);
 assert.ok(!detail.arguments.headless&&!detail.arguments.noSandbox&&!detail.arguments.gpuWatchdogDisabled&&!detail.arguments.missing.length);
 await identity.goto('chrome://gpu');let gpuText='';
 for(let i=0;i<20;i++){gpuText=await ev(identity,collectVisibleText);if(/NVIDIA.*RTX|RTX.*NVIDIA/.test(gpuText))break;await delay(250);}
 detail.gpu=activeGpuIdentity(gpuText);assert.equal(detail.gpu.vendorId,0x10de);await closeWithin(identity,'session identity page');
 pass('Session recovery uses the maintained headed hardware profile');
 a=await context.newPage();a.on('pageerror',error=>detail.errors.push(error.message));await a.goto(lossProxy.origin);await a.waitForFunction(()=>window.atlas?.workspaces);
 await enter(a);aId=service.snapshot().client;const initial=await state(a);detail.setup={fixture:initial.metadata,adapter:initial.adapter};
 assert.equal(initial.metadata.session.leaseMs,30000);assert.equal(initial.metadata.session.heartbeatMs,5000);
 b=await context.newPage();b.on('pageerror',error=>detail.errors.push(error.message));await b.goto(base);await b.waitForFunction(()=>window.atlas?.workspaces);
 await b.bringToFront();await b.click('#switch-space');await b.waitForFunction(()=>atlas.workspaces.current()==='space'&&!atlas.workspaces.pending(),null,{timeout:60000});
 await b.click('#space-mode-landscape');await b.waitForFunction(()=>!atlas.spaceModes.state.pending&&document.querySelector('#space-mode-error').textContent.includes('another tab'));
 assert.equal((await state(b)).active,false);assert.equal(await ev(b,()=>atlas.spaceModes.state.selected),'viewer');assert.equal(service.snapshot().client,aId);
 assert.deepEqual((await state(a)).pose,initial.pose);await b.screenshot({path:path.join(root,'second-tab-refused.png')});
 await a.bringToFront();await ready(a);const healthyStart=Date.now();await press(a,'e',800);await delay(60000-(Date.now()-healthyStart));
 assert.equal(service.snapshot().client,aId);
 const renewals=service.events.filter(e=>e.type==='session-renewed'&&e.id===aId);assert.ok(renewals.length>=10);
 detail.controls.push({scenario:'visible-healthy-owner',started:healthyStart,ended:Date.now(),renewals:renewals.length});
 pass('A visible healthy owner survives production renewals and a second tab cannot take over');

 // The lost page delivers no cleanup; the living page can still confirm its
 // per-request retirement while final close/heartbeat delivery is suppressed.
 detail.lossSuppression=lossProxy.suppressed;
 await context.route(/\/api\/preparation\/(?:heartbeat|close|cancel|retire\/[^/?]+)(?:\?.*)?$/,async route=>{
  const id=route.request().headers()['x-atlas-client'];
  const operation=new URL(route.request().url()).pathname.split('/')[3];
  if(suppressB&&id===bId&&['heartbeat','close'].includes(operation))await route.abort('failed');else await route.continue();
 });
 await context.route('**/api/preparation/prepare',route=>{
  const headers=route.request().headers(),input=route.request().postDataJSON();
  if(headers['x-atlas-client']!==aId||input.requirements.bodyDiameterM!==initial.metadata.grid.diameter/4||!holdFine)return route.continue();
  holdFine=false;aHeaders=apiHeaders(headers);
  heldTask=(async()=>{const response=await route.fetch({timeout:15000});assert.equal(response.status(),200);const output=await response.json();assert.equal(output.result.status,'prepared');
   heldToken=output.token;detail.heldResponse={preparedAt:Date.now(),tokenSha256:createHash('sha256').update(heldToken).digest('hex')};heldReady();await delay(35000);
   try{await route.fulfill({response});detail.heldResponse.delivery='fulfilled';}catch{detail.heldResponse.delivery='closed-target';}
  })();heldTask.catch(error=>{detail.heldResponseError=error.message;heldReady();});return heldTask;
 });
 lossProxy.block(aId);await a.mouse.move(600,400);await a.mouse.wheel(0,-120);await within(held,20000,'native response held before token delivery');
 assert.ok(!detail.heldResponseError,detail.heldResponseError);assert.ok(service.snapshot().native.publications>0);
 const aEvents=savedA=await events(a),healthyEvents=aEvents.filter(e=>e.time>=healthyStart);
 detail.runs.push({scenario:'visible-healthy-owner',started:healthyStart,ended:Date.now(),seconds:(Date.now()-healthyStart)/1000,events:healthyEvents,frames:healthyEvents.filter(e=>e.type==='frame')});allEvents.push(...aEvents);
 const lastRenewal=service.events.filter(e=>e.type==='session-renewed'&&e.id===aId).at(-1).time,lossStart=Date.now();await closeWithin(a,'lost owner page');a=null;
 const expiredA=await until(()=>service.events.find(e=>e.type==='client-expired'&&e.id===aId),33000,'silent owner expiry');
 assert.ok(expiredA.time-lastRenewal<=32000);assert.ok(!service.events.some(e=>e.type==='client-closed'&&e.id===aId));assert.equal(service.snapshot().native.publications,0);
 const expiryBegin=service.events.findIndex(e=>e.type==='client-retiring'&&e.id===aId&&e.reason==='expired');
 const heldRetirement=service.events.findIndex(e=>e.type==='producer-retired'&&e.token===heldToken),expiryEnd=service.events.indexOf(expiredA);
 assert.ok(expiryBegin>=0&&heldRetirement>expiryBegin&&heldRetirement<expiryEnd,'The held publication must retire inside expiry cleanup, not an earlier request');
 detail.heldResponse.retiredByExpiry=true;
 await b.bringToFront();await b.click('#landscape-retry');await ready(b,15000);assert.ok(Date.now()-expiredA.time<=15000);bId=service.snapshot().client;assert.notEqual(bId,aId);
 const pubs=service.snapshot().native.publications,foreignToken=service.events.filter(e=>e.type==='producer-prepared'&&e.identity.runtimeId===bId).at(-1).token;
 const oldRetire=await fetch(base+'/api/preparation/retire/'+foreignToken,{method:'POST',headers:aHeaders,body:'{}'});assert.equal(oldRetire.status,410);
 const oldRenewal=await fetch(base+'/api/preparation/heartbeat',{method:'POST',headers:aHeaders,body:JSON.stringify({sequence:999})});assert.equal(oldRenewal.status,410);
 assert.equal(service.snapshot().native.publications,pubs);assert.equal(service.snapshot().client,bId);
 await heldTask;assert.ok(!detail.heldResponseError,detail.heldResponseError);assert.equal(service.snapshot().client,bId);
 detail.controls.push({scenario:'silent-owner-loss',seconds:(Date.now()-lossStart)/1000,expiryMs:expiredA.time-lastRenewal,replacementPresentationMs:Date.now()-expiredA.time,termination:'expiry',oldQueueAtAdmission:'held result had already completed native work'});
 pass('Silent loss expires the old owner and late messages cannot mutate its replacement');

 await b.locator('#landscape-canvas').click({position:{x:600,y:350}});await ready(b);await press(b,'e',500);const retained=(await state(b)).pose;
 const livingStart=Date.now(),lastB=service.events.filter(e=>e.type==='session-renewed'&&e.id===bId).at(-1).time;suppressB=true;
 await b.waitForFunction(()=>!atlas.landscape.state.payload?.session?.verified,null,{timeout:10000});
 const paused=await state(b),before=await events(b),navBefore=before.filter(e=>e.type==='navigation').length,requestsBefore=before.filter(e=>e.type==='request').length;
 await press(b,'e',2000);assert.deepEqual((await state(b)).pose,paused.pose);const after=await events(b);
 assert.equal(after.filter(e=>e.type==='navigation').length,navBefore);assert.equal(after.filter(e=>e.type==='request').length,requestsBefore);
 await b.waitForFunction(()=>atlas.landscape.state.phase==='expired',null,{timeout:35000});await ev(b,()=>atlas.landscape.whenReleased(),null,'expired page retirement',30000);
 assert.equal((await state(b)).cleanupError,null);assert.deepEqual((await state(b)).pose,retained);
 const expiredB=await until(()=>service.events.find(e=>e.type==='client-expired'&&e.id===bId),33000,'living session server expiry');
 assert.ok(expiredB.time-lastB<=32000);assert.ok(!service.events.some(e=>e.type==='client-closed'&&e.id===bId));
 assert.match(await ev(b,()=>document.querySelector('#space-mode-error').textContent),/expired/);await b.screenshot({path:path.join(root,'session-expired.png')});
 suppressB=false;await b.click('#landscape-retry');await ready(b,15000);assert.deepEqual((await state(b)).pose,retained);assert.notEqual(service.snapshot().client,bId);
 assert.ok((Date.now()-livingStart)/1000<=50);await b.screenshot({path:path.join(root,'session-retried.png')});
 detail.controls.push({scenario:'living-page-expiry-retry',seconds:(Date.now()-livingStart)/1000,expiryMs:expiredB.time-lastB,poseRetained:true,queriesDuringPause:0});
 pass('Expired living page fences input and explicitly retries at its own retained pose');
 await ev(b,async()=>{await atlas.workspaces.switchTo('plane');await atlas.landscape.whenReleased();},null,'final Landscape drain',30000);allEvents.push(...await events(b));
 assert.equal(detail.errors.length,0,detail.errors.join('\n'));
 assert.ok(!allEvents.some(e=>['runtime-error','device-error','cleanup-error'].includes(e.type)));
 assert.ok(allEvents.filter(e=>e.type==='workspace-error').every(e=>e.message.includes('another tab')));
 detail.pass=true;
}catch(error){detail.failure=String(error.stack??error);process.exitCode=1;report.push({name:'FAIL',error:detail.failure});console.error(detail.failure);if(b&&!b.isClosed())await b.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});}
finally{
 const errors=[];
 try{if(b&&!b.isClosed()){await ev(b,async()=>{await atlas.workspaces.switchTo('plane');await atlas.landscape.whenReleased();},null,'session cleanup drain',30000);const be=await events(b);allEvents.length=0;allEvents.push(...savedA,...be);}}catch(error){errors.push(error.message);}
 try{await observer.sample();await closeWithin(context,'session context');await closeWithin(browser,'session browser');}catch(error){errors.push(error.message);}
 try{await lossProxy?.close();}catch(error){errors.push(error.message);}
 try{if(service)detail.serverCleanup=await service.close();}catch(error){errors.push(error.message);}
 detail.processes=await observer.stop();detail.cleanupErrors=errors;detail.cleanup=!errors.length&&!detail.processes.alive.length&&!detail.processes.errors.length&&detail.serverCleanup?.cleanup===true;
 detail.hello=detail.serverCleanup?.hello;detail.browserCleanup={events:allEvents};detail.ended=Date.now();
 await fs.writeFile(path.join(root,'session.json'),JSON.stringify(detail,null,2)+'\n');await fs.writeFile(path.join(root,'browser.json'),JSON.stringify(detail,null,2)+'\n');
 if(detail.pass&&detail.cleanup){
  try{
   const options={cwd:process.cwd(),timeout:120000,maxBuffer:4*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}};
   // All prepared native records, including the undelivered fine response, are qualified.
   await exec(process.execPath,['scripts/experiments/pc2-qualification-input.mjs',root,'session.json'],options);
   await exec('/mnt/ml_storage/scratch/venvs/gpu/bin/python',['scripts/experiments/pc2-qualify.py',root],options);
   await exec('/mnt/ml_storage/scratch/venvs/gpu/bin/python',['scripts/experiments/pc2-buffer-audit.py',root],options);
   await exec('/mnt/ml_storage/scratch/venvs/gpu/bin/python',['scripts/experiments/pc2-audit.py',root],options);
   pass('Session-control geometry buffers and recorded movement pass finite independent audits');
   detail.launcher=await within(runOwnedPreview({runRoot:path.join(root,'launcher'),port:5200,onReady:async({context:owned,service:helper,pageOwner})=>{
    const first=owned.pages()[0],second=await owned.newPage();second.setDefaultTimeout(5000);await second.goto('http://127.0.0.1:5200/',{timeout:10000});await second.waitForFunction(()=>window.atlas?.workspaces);
    await closeWithin(first,'launcher first page');assert.equal(pageOwner.snapshot().pages,1);assert.equal(pageOwner.snapshot().finished,false);
    assert.equal((await fetch('http://127.0.0.1:5200/api/preparation/status')).status,200);assert.equal(helper.snapshot().session.state,'available');
    await closeWithin(second,'launcher final page');assert.equal(pageOwner.snapshot().finished,true);
   }}),30000,'owned launcher page lifetime');
   assert.equal(detail.launcher.cleanup,true);pass('Launcher keeps another owned page alive and stops after its final page closes');
  }catch(error){detail.failure=error.stderr??String(error.stack??error);if(error.code==='ATLAS_WAIT_TIMEOUT'||detail.failure.includes('cleanup unconfirmed'))detail.cleanup=false;try{const launched=JSON.parse(await fs.readFile(path.join(root,'launcher/launcher.json')));if(!launched.cleanup)detail.cleanup=false;}catch{}report.push({name:'FAIL',error:detail.failure});process.exitCode=1;}
 }
 if(detail.cleanup&&!detail.failure)pass('Session controls preserve source identity and confirm owned process cleanup');
 if(!detail.cleanup){report.push({name:'FAIL',error:'CLEANUP-UNCONFIRMED'});process.exitCode=125;}
 detail.sources={};for(const name of ['scripts/preparation/application-policy.mjs','scripts/preparation/application-server.mjs','scripts/world-preview.mjs','scripts/preparation/page-lifetime.mjs','src/space/preparation/application-client.js','src/space/preparation/workspace.js','src/app.js','index.html','tests/space-preparation-session.mjs','tests/support/session-loss-proxy.mjs'])detail.sources[name]=createHash('sha256').update(await fs.readFile(name)).digest('hex');
 detail.completed=Date.now();await fs.writeFile(path.join(root,'session.json'),JSON.stringify(detail,null,2)+'\n');await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/space-preparation-session-report.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({root,pass:detail.pass&&!detail.failure,cleanup:detail.cleanup,failure:detail.failure}));
}
