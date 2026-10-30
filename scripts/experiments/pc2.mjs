import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { createPc2Server } from '../preparation/pc2-server.mjs';
import { within, ev, boundContext, closeWithin, chromeLaunchEnv, CHROME_TMPDIR } from '../../tests/support/bounded.mjs';
import { PROJECT0_LAUNCH_ARGS, collectVisibleText, activeGpuIdentity, checkEffectiveArguments } from '../../tests/support/space-suite.mjs';

const mode=process.argv[2]??'smoke',root=path.resolve(process.argv[3]??'/mnt/ml_storage/scratch/atlas-pc2/browser-smoke-r0');
if(!['smoke','full','input','control'].includes(mode)||!root.startsWith('/mnt/ml_storage/scratch/atlas-pc2/'))throw Error('Explicit PC2 mode and scratch output required');
if(!process.env.ATLAS_GPU_HANDOFF||process.env.ATLAS_GPU_DEFERRED)throw Error('Exactly one hardware handoff required');
await fs.mkdir(root);const report={mode,started:new Date().toISOString(),startEpoch:Date.now(),handoff:process.env.ATLAS_GPU_HANDOFF,viewport:{width:1280,height:720},runs:[],errors:[],cleanup:false};
let browser,context,page,service,sampling=false;const pids=new Set(),samples=[],exec=promisify(execFile);
async function sample(){
 if(sampling)return;sampling=true;
 try{const {stdout}=await exec('ps',['-e','-o','pid=,ppid=,rss=,comm='],{timeout:2000});const rows=stdout.trim().split('\n').map(line=>{const [pid,ppid,rss,comm]=line.trim().split(/\s+/);return{pid:+pid,ppid:+ppid,rssKiB:+rss,comm};});
  const owned=new Set([process.pid]);let changed=true;while(changed){changed=false;for(const row of rows)if(row.comm!=='ps'&&owned.has(row.ppid)&&!owned.has(row.pid)){owned.add(row.pid);changed=true;}}
  const tree=rows.filter(row=>owned.has(row.pid));for(const row of tree)if(row.pid!==process.pid)pids.add(row.pid);samples.push({time:Date.now(),rssKiB:tree.reduce((s,r)=>s+r.rssKiB,0),tree});
 }catch(error){report.errors.push('process sampler: '+error.message);}finally{sampling=false;}
}
const sampler=setInterval(()=>sample(),1000),deadline=setTimeout(()=>{console.error('PC2 OUTER DEADLINE');process.exit(124);},mode==='full'?580000:mode==='input'?150000:120000);deadline.unref();
const delay=(ms,label)=>within(new Promise(resolve=>setTimeout(resolve,ms)),ms+2000,label);
async function fixedRun(seconds,options={}){
 await ev(page,options=>demo.startRun(options),options,'start flight',45000);
 for(let elapsed=0;elapsed<seconds;elapsed+=10){await delay(Math.min(10,seconds-elapsed)*1000,'fixed flight interval');const status=await ev(page,()=>demo.snapshot());console.log(JSON.stringify({mode,elapsed:elapsed+Math.min(10,seconds-elapsed),status}));if(status.errors.length)throw Error(status.errors.join('\n'));}
 const run=await ev(page,()=>demo.finishRun());report.runs.push(run);await fs.writeFile(path.join(root,`run-${report.runs.length-1}.json`),JSON.stringify(run,null,2)+'\n');return run;
}
try{
 service=await createPc2Server({runRoot:root});report.hello=service.adapter.hello();await sample();await fs.mkdir(CHROME_TMPDIR,{recursive:true});
 browser=await chromium.launch({channel:'chrome',headless:false,chromiumSandbox:true,timeout:30000,env:chromeLaunchEnv(),args:['--disable-dev-shm-usage',...PROJECT0_LAUNCH_ARGS]});
 context=boundContext(await browser.newContext({viewport:report.viewport,deviceScaleFactor:1}));const identity=await context.newPage();
 await identity.goto('chrome://version');report.effectiveArguments=checkEffectiveArguments(await ev(identity,()=>document.querySelector('#command_line')?.textContent??document.body.innerText),PROJECT0_LAUNCH_ARGS);
 if(report.effectiveArguments.noSandbox||report.effectiveArguments.headless||report.effectiveArguments.gpuWatchdogDisabled||report.effectiveArguments.missing.length)throw Error('Required headed sandboxed launch profile mismatch');
 await identity.goto('chrome://gpu');let text='';for(let i=0;i<20;i++){text=await ev(identity,collectVisibleText);if(/NVIDIA.*RTX|RTX.*NVIDIA/i.test(text))break;await delay(250,'hardware identity');}
 report.chromeGpu=activeGpuIdentity(text);report.gpuText=text;if(report.chromeGpu.vendorId!==0x10de)throw Error('Discrete NVIDIA GPU not confirmed');await closeWithin(identity,'identity page');
 page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.stack??error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
 await page.goto('http://127.0.0.1:5280/');await page.waitForFunction(()=>window.demo?.ready||window.demo?.error,{},{timeout:45000});
 report.setup=await ev(page,()=>({ready:demo.ready,error:demo.error,cleanupError:demo.cleanupError,adapter:demo.adapter,startupMs:demo.startupMs,controls:demo.controls,fixture:demo.fixture}));
 if(!report.setup.ready||!/nvidia/i.test(JSON.stringify(report.setup.adapter)))throw Error(report.setup.error??'Hardware browser setup failed');
 report.processStartToReadyMs=Date.now()-report.startEpoch;await sample();await page.screenshot({path:path.join(root,'start.png')});
 if(mode==='smoke')await fixedRun(20);
 if(mode==='control')await fixedRun(20,{late:true});
 if(mode==='full'){await delay(2000,'stationary browser warmup');for(let i=0;i<3;i++)await fixedRun(90);await fixedRun(20,{late:true});}
 if(mode==='input'){
  const began=Date.now();await ev(page,()=>demo.startRun({manual:true}),null,'start real input',45000);report.input=[];
  const snap=async label=>{const value=await ev(page,()=>demo.snapshot());report.input.push({label,time:Date.now(),...value});return value;};
  const press=async(key,ms)=>{await page.keyboard.down(key);try{await delay(ms,'real '+key+' input');}finally{await page.keyboard.up(key);}return snap(key);};
  const initial=await snap('initial');await press('e',2200);
  const t=report.setup.fixture.grid.axes[0];await ev(page,v=>demo.setLook(Math.atan2(v[0],v[2]),Math.asin(v[1])),t);await press('w',3000);await press('d',1000);await press('a',1000);await press('s',3000);await press('q',2200);
  await ev(page,()=>{demo.holdInspection(true);demo.beginFineVisit();});await page.waitForFunction(()=>demo.snapshot().phase==='fineWait'&&demo.snapshot().resident.includes('fine')||demo.errors.length,{},{timeout:20000});
  await page.mouse.move(600,400);await page.mouse.wheel(0,-120);await ev(page,()=>demo.releaseFineWait());await page.waitForFunction(()=>demo.snapshot().phase==='inspectHold'||demo.errors.length,{},{timeout:15000});
  await ev(page,()=>{demo.free();const s=demo.snapshot(),v=demo.fixture.approach.target.map((x,i)=>x-s.position[i]),n=Math.hypot(...v);demo.setLook(Math.atan2(v[0],v[2]),Math.asin(v[1]/n));});
  const before=await snap('fine-before');await page.screenshot({path:path.join(root,'fine-inspection.png')});const contact=await press('w',1600);await page.mouse.wheel(0,120);await delay(150,'growth response');const growth=await snap('grow');const retreat=await press('s',1600);
  await page.mouse.move(800,400);await page.mouse.down();await page.mouse.move(820,410,{steps:3});await page.mouse.up();const look=await snap('look');
  report.inputSeconds=(Date.now()-began)/1000;report.inputChecks={vertical:report.input.some(s=>s.positionD[1]>.2),nonzeroK:report.input.some(s=>s.active?.split(',')[2]&&s.active.split(',')[2]!=='0'),lateral:report.input.some(s=>Math.hypot(s.positionD[0],s.positionD[2])>.4),contact:contact.contacts>before.contacts,growthRefused:growth.bodyScale===.25,retreat:retreat.position.some((x,i)=>Math.abs(x-contact.position[i])>1e-6),lookChanged:look.yaw!==retreat.yaw||look.pitch!==retreat.pitch,bounded:report.inputSeconds<=60};
  report.runs.push(await ev(page,()=>demo.finishRun()));if(Object.values(report.inputChecks).some(v=>!v))throw Error('Real-input criterion miss: '+JSON.stringify(report.inputChecks));
 }
 report.final=await ev(page,()=>demo.snapshot());report.browser=browser.version();await page.screenshot({path:path.join(root,'final.png')});if(report.errors.length||report.final.errors.length)throw Error('Recorded browser errors');
}catch(error){report.failure=String(error.stack??error);console.error(report.failure);process.exitCode=1;if(page)await page.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});}
finally{
 const cleanupErrors=[];try{if(page)report.browserCleanup=await ev(page,()=>demo.dispose?.(),null,'PC2 resource drain',35000);}catch(error){cleanupErrors.push(String(error));}
 try{await sample();await closeWithin(context,'PC2 context');await closeWithin(browser,'installed Chrome');if(browser?.isConnected())throw Error('Browser remains connected');}catch(error){cleanupErrors.push(String(error));}
 try{if(service)report.serverCleanup=await within(service.close(),20000,'native/server shutdown');}catch(error){cleanupErrors.push(String(error));}
 clearInterval(sampler);while(sampling)await delay(20,'sampler drain');
 let alive=[];for(let attempt=0;attempt<30;attempt++){alive=[...pids].filter(pid=>{try{process.kill(pid,0);return true;}catch{return false;}});if(!alive.length)break;await delay(100,'owned process exit');}
 if(alive.length)cleanupErrors.push('Owned PIDs remain: '+alive.join(','));report.processes={ownedPids:[...pids],aliveAfter:alive,samples,peakRssKiB:Math.max(0,...samples.map(s=>s.rssKiB))};
 report.cleanupErrors=cleanupErrors;report.cleanup=cleanupErrors.length===0&&(!service||report.serverCleanup?.cleanup===true);report.ended=new Date().toISOString();
 const sources=['scripts/preparation/native-worker.py','scripts/preparation/native-adapter.mjs','scripts/preparation/native-controller.mjs','scripts/preparation/native-queue.mjs','scripts/preparation/publications.mjs','scripts/preparation/pc2-server.mjs','scripts/experiments/pc2.mjs','tests/fixtures/pc2/app.mjs','tests/fixtures/pc2/index.html','src/space/preparation/spatial-grid.js','src/space/preparation/contract.js','src/space/preparation/lifecycle.js','src/space/preparation/region-navigation.js','src/space/preparation/prediction.js','src/space/preparation/browser-preparer.js','src/space/preparation/browser-producer.js','src/space/preparation/collision-worker.js','src/space/preparation/mesh-normals.js','src/space/preparation/wasm-memory.js','src/space/render/webgpu/prepared-regions.js'];
 sources.push('tests/fixtures/pc2/collision-worker.mjs');
 report.sources=Object.fromEntries(await Promise.all(sources.map(async filename=>[filename,createHash('sha256').update(await fs.readFile(new URL('../../'+filename,import.meta.url))).digest('hex')])));
 await fs.writeFile(path.join(root,'browser.json'),JSON.stringify(report,null,2)+'\n');clearTimeout(deadline);console.log(JSON.stringify({output:path.join(root,'browser.json'),cleanup:report.cleanup,failure:report.failure,setup:report.setup,final:report.final}));if(!report.cleanup)process.exitCode=125;
}
