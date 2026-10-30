// BI1.B actual downloaded-file restoration after owned helper/browser restart.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from 'playwright';
import {createApplicationServer} from '../scripts/preparation/application-server.mjs';
import {observeOwnedProcesses} from '../scripts/preparation/process-observer.mjs';
import {within,ev,boundContext,closeWithin,chromeLaunchEnv,installSuiteDeadline} from './support/bounded.mjs';
import {PROJECT0_LAUNCH_ARGS,checkEffectiveArguments,collectVisibleText,activeGpuIdentity} from './support/space-suite.mjs';

if(!process.env.ATLAS_GPU_HANDOFF||process.env.ATLAS_GPU_DEFERRED)throw Error('Headed hardware handoff required');
installSuiteDeadline('space-prepared-files',360000);
const root=path.resolve(process.env.ATLAS_BI1B_RUN_ROOT??'/mnt/ml_storage/scratch/atlas-bi1b/files-'+new Date().toISOString().replace(/[:.]/g,'-'));
assert.ok(root.startsWith('/mnt/ml_storage/scratch/atlas-bi1b/'));await fs.mkdir(root);
const detail={started:Date.now(),errors:[],phases:[],checks:[],cleanup:false},report=[],exec=promisify(execFile),base='http://127.0.0.1:5196';
let service,browser,context,page,observer,phase,interactionMs=0;
const delay=ms=>within(new Promise(resolve=>setTimeout(resolve,ms)),ms+2000,'file workflow interval');
const state=()=>ev(page,()=>atlas.landscape.state),hist=()=>ev(page,()=>atlas.landscape.history);
const events=()=>ev(page,()=>atlas.landscape.events());
const pass=name=>{detail.checks.push(name);report.push({name});console.log('PASS '+name);};
const camera=pose=>Object.fromEntries(['kind','originM','positionLocalM','orientationWxyz','bodyDiameterM','verticalFovDegrees'].map(k=>[k,pose[k]]));
async function ready(expected){await page.waitForFunction(value=>{const s=atlas.landscape.state;return s.active&&s.payload?.session?.verified&&(!value||JSON.stringify(s.pose.positionLocalM)===JSON.stringify(value));},expected??null,{timeout:60000});}
async function press(key,ms){await page.keyboard.down(key);try{await delay(ms);}finally{await page.keyboard.up(key);}}
async function begin(label){
 const dir=path.join(root,label);await fs.mkdir(dir);phase={label,dir,mode:'files',started:Date.now(),runs:[],errors:[]};observer=observeOwnedProcesses();
 service=await createApplicationServer({runRoot:dir,port:5196});
 browser=await chromium.launch({channel:'chrome',headless:false,chromiumSandbox:true,timeout:30000,env:chromeLaunchEnv(),args:['--disable-dev-shm-usage',...PROJECT0_LAUNCH_ARGS]});
 context=boundContext(await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true}));
 const identity=await context.newPage();await identity.goto('chrome://version');phase.arguments=checkEffectiveArguments(await ev(identity,()=>document.querySelector('#command_line').textContent),PROJECT0_LAUNCH_ARGS);
 assert.ok(!phase.arguments.headless&&!phase.arguments.noSandbox&&!phase.arguments.gpuWatchdogDisabled&&!phase.arguments.missing.length);
 if(!detail.gpu){await identity.goto('chrome://gpu');let text='';for(let i=0;i<20;i++){text=await ev(identity,collectVisibleText);if(/NVIDIA.*RTX|RTX.*NVIDIA/.test(text))break;await delay(250);}detail.gpu=activeGpuIdentity(text);assert.equal(detail.gpu.vendorId,0x10de);}
 await closeWithin(identity,'file workflow identity');page=await context.newPage();page.on('pageerror',e=>{phase.errors.push(e.message);detail.errors.push(e.message);});
 await page.goto(base);await page.waitForFunction(()=>window.atlas?.workspaces);await page.click('#switch-space');await page.waitForFunction(()=>atlas.workspaces.current()==='space'&&!atlas.workspaces.pending(),null,{timeout:60000});
}
async function finish(){
 if(!phase)return;
 const errors=[];
 try{if(page&&!page.isClosed()){await ev(page,async()=>{await atlas.workspaces.switchTo('plane');await atlas.landscape.whenReleased();},null,'file workflow drain',30000);phase.browserCleanup={events:await events()};phase.final=service.snapshot();}}catch(e){errors.push(e.message);}
 try{await observer?.sample();await closeWithin(context,'file context');await closeWithin(browser,'file Chrome');}catch(e){errors.push(e.message);}
 try{if(service)phase.serverCleanup=await service.close();}catch(e){errors.push(e.message);}
 phase.processes=await observer.stop();phase.cleanupErrors=errors;phase.cleanup=!errors.length&&!phase.processes.alive.length&&!phase.processes.errors.length&&phase.serverCleanup?.cleanup===true;
 phase.hello=phase.serverCleanup?.hello;phase.ended=Date.now();
 await fs.writeFile(path.join(phase.dir,'browser.json'),JSON.stringify(phase,null,2)+'\n');detail.phases.push(phase);
 page=null;context=null;browser=null;service=null;observer=null;const closed=phase;phase=null;
 assert.equal(closed.cleanup,true,'Owned phase cleanup must be confirmed before restart');
 return closed;
}
async function download(filename){const waiting=page.waitForEvent('download',{timeout:30000});await page.click('#landscape-save-scene');const file=await within(waiting,30000,'Landscape download');await within(file.saveAs(filename),30000,'preserve actual scene download');return fs.readFile(filename,'utf8');}
async function pulse(ms,label){await page.locator('#landscape-canvas').click({position:{x:500,y:400}});const index=(await events()).length,started=Date.now();await press('e',ms);const list=(await events()).slice(index);phase.runs.push({scenario:label,started,ended:Date.now(),events:list,frames:list.filter(e=>e.type==='frame'),seconds:(Date.now()-started)/1000});}
try{
 await begin('save');pass('Prepared files use the maintained headed hardware profile');
 let began=Date.now();await page.click('#space-mode-landscape');await ready();phase.setup={fixture:(await state()).metadata};
 await pulse(800,'saved-place-navigation');const saved=(await state()).pose;assert.ok(saved.positionLocalM.some(x=>x!==0));
 const filename=path.join(root,'actual-saved-scene.json'),bytes=await download(filename),snapshot=JSON.parse(bytes);
 assert.deepEqual(snapshot.camera,camera(saved));assert.doesNotMatch(bytes,/\/mnt\/|\/root\/|scratch|bundle|\.npz|runtimeId|nonce|token|epoch|producer/);
 detail.saved={filename,sha256:createHash('sha256').update(bytes).digest('hex'),scene:snapshot,pose:saved};
 await page.screenshot({path:path.join(root,'saved-place.png')});interactionMs+=Date.now()-began;
 const first=await finish();assert.equal(first.final.native.publications,0);
 pass('An actual nondefault Landscape file contains complete portable world and camera data');

 await begin('reopen');began=Date.now();const viewerBefore=await ev(page,()=>({hash:atlas.space.sceneHash,history:atlas.space.history}));
 await page.setInputFiles('#space-open-scene',filename);await page.waitForFunction(()=>document.querySelector('#space-file-status').textContent.includes('could not be opened'));
 assert.deepEqual(await ev(page,()=>({hash:atlas.space.sceneHash,history:atlas.space.history})),viewerBefore);
 pass('The existing viewer refuses a prepared file without changing its scene or histories');
 await page.setInputFiles('#landscape-open-scene',filename);await ready(saved.positionLocalM);const restored=await state();phase.setup={fixture:restored.metadata};
 assert.notEqual(restored.metadata.producer.instanceId,first.setup.fixture.producer.instanceId);assert.deepEqual(restored.pose,saved);assert.deepEqual(restored.requestedScene,snapshot);
 const exported=await download(path.join(root,'actual-reexported-scene.json'));assert.equal(exported,bytes);detail.reopen={producer:restored.metadata.producer.instanceId,exactReexport:true,history:await hist()};
 pass('The downloaded scene reopens after a new helper and browser with exact promised place and bytes');

 const before=await hist();await pulse(250,'history-navigation');const moved=(await state()).pose,after=await hist();
 assert.equal(after.camera.length,before.camera.length+1);assert.equal(after.undoDepth,before.undoDepth);
 await page.click('#landscape-back');await ready(saved.positionLocalM);assert.deepEqual((await state()).pose,saved);assert.equal((await hist()).camera.length,after.camera.length);
 await page.click('#landscape-forward');await ready(moved.positionLocalM);assert.deepEqual((await state()).pose,moved);
 pass('Actual navigation makes one camera entry and Back Forward restore it without content edits');
 await page.setInputFiles('#landscape-open-scene',filename);await ready(saved.positionLocalM);assert.equal((await hist()).undoDepth,after.undoDepth+1);
 await page.click('#landscape-undo');await ready(moved.positionLocalM);assert.deepEqual((await state()).pose,moved);
 await page.click('#landscape-redo');await ready(saved.positionLocalM);assert.deepEqual((await state()).pose,saved);
 pass('Opening a complete file is one Undo Redo edit with exact scene restoration');
 const stable=await ev(page,()=>({hash:atlas.landscape.sceneHash,history:atlas.landscape.history}));
 await page.setInputFiles('#landscape-open-scene',{name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{')});
 await page.waitForFunction(()=>document.querySelector('#landscape-file-status').textContent.includes('could not be opened'));
 assert.deepEqual(await ev(page,()=>({hash:atlas.landscape.sceneHash,history:atlas.landscape.history})),stable);
 const bad=structuredClone(snapshot);bad.camera.positionLocalM=[999,0,0];await page.setInputFiles('#landscape-open-scene',{name:'unsupported.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
 await page.waitForFunction(()=>!atlas.spaceModes.state.pending&&!atlas.landscape.state.active&&atlas.landscape.state.requestedScene?.camera.positionLocalM[0]===999);
 assert.deepEqual((await state()).pose,saved);await page.waitForFunction(()=>document.querySelector('#landscape-file-status').textContent.includes('retained'));
 assert.ok((await state()).requestedScene.camera.positionLocalM[0]===999);await page.click('#landscape-retry');
 await page.waitForFunction(()=>!atlas.spaceModes.state.pending&&!atlas.landscape.state.active);assert.equal((await state()).requestedScene.camera.positionLocalM[0],999);
 await page.click('#landscape-undo');await ready(saved.positionLocalM);assert.deepEqual((await state()).pose,saved);
 pass('Invalid files preserve history and unsupported requested poses remain explicit through Retry and Undo');
 await page.screenshot({path:path.join(root,'restored-place.png')});interactionMs+=Date.now()-began;assert.ok(interactionMs<=180000);detail.interactionMs=interactionMs;
 const second=await finish();
 for(const p of detail.phases){assert.equal(p.errors.length,0);assert.ok(!p.browserCleanup.events.some(e=>['workspace-error','runtime-error','device-error','cleanup-error'].includes(e.type)));
  const options={cwd:process.cwd(),timeout:120000,maxBuffer:4*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}};
  await exec(process.execPath,['scripts/experiments/pc2-qualification-input.mjs',p.dir,'browser.json'],options);
  await exec('/mnt/ml_storage/scratch/venvs/gpu/bin/python',['scripts/experiments/pc2-qualify.py',p.dir],options);
  await exec('/mnt/ml_storage/scratch/venvs/gpu/bin/python',['scripts/experiments/pc2-buffer-audit.py',p.dir],options);
  await exec('/mnt/ml_storage/scratch/venvs/gpu/bin/python',['scripts/experiments/pc2-audit.py',p.dir],options);
 }
 pass('Saved and restored delivered geometry passes finite buffer and recorded-motion audits');
 detail.pass=true;
}catch(error){detail.failure=String(error.stack??error);console.error(detail.failure);report.push({name:'FAIL',error:detail.failure});process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});}
finally{
 if(phase)try{await finish();}catch(error){detail.cleanupFailure=error.message;}
 detail.cleanup=!detail.cleanupFailure&&detail.phases.length>0&&detail.phases.every(p=>p.cleanup);
 if(detail.cleanup&&!detail.failure)pass('Prepared file workflow confirms source identity and every owned process cleanup');
 if(!detail.cleanup){report.push({name:'FAIL',error:'CLEANUP-UNCONFIRMED'});process.exitCode=125;}
 detail.sources={};for(const name of ['src/space/preparation/pose.js','src/space/render/webgpu/prepared-regions.js','src/space/preparation/scene-adapter.js','src/space/preparation/scene-history.js','src/space/preparation/workspace.js','src/space/mode-host.js','src/app.js','index.html','src/ui/style.css','tests/space-prepared-files.mjs'])detail.sources[name]=createHash('sha256').update(await fs.readFile(name)).digest('hex');
 detail.ended=Date.now();await fs.writeFile(path.join(root,'files.json'),JSON.stringify(detail,null,2)+'\n');await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/space-prepared-files-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({root,pass:detail.pass&&!detail.failure,cleanup:detail.cleanup,failure:detail.failure}));
}
