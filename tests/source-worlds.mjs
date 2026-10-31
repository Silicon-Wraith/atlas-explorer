// A2.2a actual launcher, input, contact and portable-place acceptance.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runOwnedPreview } from '../scripts/world-preview.mjs';
import { runBounded } from '../scripts/gate/supervise.mjs';
import { createSpatialGrid } from '../src/space/preparation/spatial-grid.js';
import { createPreparedPoseModel, preparedOrientation } from '../src/space/preparation/pose.js';
import { preparedRunRoot } from './support/prepared-run-root.mjs';
import { within, ev, boundContext, closeWithin, installSuiteDeadline } from './support/bounded.mjs';
import { PROJECT0_LAUNCH_ARGS, checkEffectiveArguments, collectVisibleText, activeGpuIdentity } from './support/space-suite.mjs';
if(!process.env.ATLAS_GPU_HANDOFF||process.env.ATLAS_GPU_DEFERRED)throw Error('One hardware handoff required');
installSuiteDeadline('source-worlds',360000);
const root=preparedRunRoot(process.env.ATLAS_SOURCE_WORLD_RUN_ROOT??'/mnt/ml_storage/scratch/atlas-md2a22/browser-'+Date.now(),'source');await fs.mkdir(root);
const inputs=preparedRunRoot(process.env.ATLAS_SOURCE_WORLD_INPUTS??'/mnt/ml_storage/scratch/atlas-md2a22/preflight-r0','source');
const report=[],detail={started:Date.now(),inputs,phases:[],checks:[],errors:[]},saved=new Map();let preview,control,page,phase;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),state=()=>ev(page,()=>atlas.landscape.state),events=()=>ev(page,()=>atlas.landscape.events());
const pass=name=>{report.push({name});detail.checks.push(name);console.log('PASS '+name);};
const ready=body=>page.waitForFunction(d=>atlas.landscape.state.active&&atlas.landscape.state.payload?.session?.verified&&(!d||atlas.landscape.state.pose.bodyDiameterM===d),body??null,{timeout:60000});
async function begin(kind,label) {
 const dir=path.join(root,label);await fs.mkdir(dir);phase={kind,label,dir,started:Date.now(),runs:[],errors:[]};
 let resolveReady,rejectReady;const opened=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});
 preview=runOwnedPreview({runRoot:dir,port:5196,sourceWorld:path.join(inputs,kind,'input'),onReady:handles=>{control=handles;resolveReady(handles);}});preview.catch(rejectReady);
 await within(opened,45000,'source launcher ready');const context=boundContext(control.context);page=context.pages()[0];page.on('pageerror',e=>phase?.errors.push(e.message));
 const identity=await context.newPage();await identity.goto('chrome://version');phase.arguments=checkEffectiveArguments(await ev(identity,()=>document.querySelector('#command_line').textContent),PROJECT0_LAUNCH_ARGS);
 assert.ok(!phase.arguments.headless&&!phase.arguments.noSandbox&&!phase.arguments.gpuWatchdogDisabled&&!phase.arguments.missing.length);
 if(!detail.gpu){await identity.goto('chrome://gpu');let text='';for(let i=0;i<20;i++){text=await ev(identity,collectVisibleText);if(/NVIDIA.*RTX|RTX.*NVIDIA/.test(text))break;await delay(250);}detail.gpu=activeGpuIdentity(text);assert.equal(detail.gpu.vendorId,0x10de);}
 await closeWithin(identity,'source identity');await page.bringToFront();
 await page.waitForFunction(()=>window.atlas?.workspaces);await page.click('#switch-space');await page.waitForFunction(()=>atlas.workspaces.current()==='space'&&!atlas.workspaces.pending(),null,{timeout:60000});
}
async function finish() {
 if(!phase)return;
 const current=phase,errors=[];
 current.events=[];
 if(control)try{await ev(page,async()=>{await atlas.workspaces.switchTo('plane');await atlas.landscape.whenReleased();},null,'source resources drain',30000);current.events=await events();current.final=control.service.snapshot();if(current.final.native)assert.equal(current.final.native.publications,0);}catch(e){errors.push(e.message);}
 control?.finish();try{current.launcher=await within(preview,35000,'source launcher cleanup');}catch(e){current.launcherFailure=e.message;try{current.launcher=JSON.parse(await fs.readFile(path.join(current.dir,'launcher.json')));}catch{errors.push('Launcher cleanup record unavailable');}}
 current.cleanup=errors.length===0&&current.launcher?.cleanup===true;current.cleanupErrors=errors;current.ended=Date.now();detail.phases.push(current);await fs.writeFile(path.join(current.dir,'browser.json'),JSON.stringify(current,null,2)+'\n');phase=null;preview=null;control=null;page=null;
 assert.equal(current.cleanup,true,'Owned source launcher cleanup');assert.equal(current.errors.length,0);assert.ok(!current.events.some(e=>['workspace-error','runtime-error','cleanup-error','device-error'].includes(e.type)));
 return current;
}
async function pulse(key,ms,label) {
 await page.locator('#landscape-canvas').click({position:{x:500,y:300}});const index=(await events()).length,started=Date.now();await page.keyboard.down(key);try{await delay(ms);}finally{await page.keyboard.up(key);}
 const list=(await events()).slice(index);phase.runs.push({label,key,started,ended:Date.now(),seconds:(Date.now()-started)/1000,frames:list.filter(e=>e.type==='frame'),navigation:list.filter(e=>e.type==='navigation')});
}
async function download(file) {const waiting=page.waitForEvent('download',{timeout:30000});await page.click('#landscape-save-scene');const data=await within(waiting,30000,'source scene download');await within(data.saveAs(file),30000,'source scene preservation');return fs.readFile(file,'utf8');}
async function boundary(setup,scene) {
 const model=createPreparedPoseModel({world:setup.world,grid:createSpatialGrid(setup.grid),fineBounds:setup.fineBounds});
 const fixture=structuredClone(scene);fixture.camera.bodyDiameterM=.025;fixture.camera.positionLocalM=[model.localBounds.min[0]+.000001,setup.fineBounds.max[1]-.25-model.originM[1],0];fixture.camera.orientationWxyz=preparedOrientation(-Math.PI/2,0);
 assert.ok(model.supportsPositionM(fixture.camera.positionLocalM.map((x,i)=>x+model.originM[i]),.025));
 await page.setInputFiles('#landscape-open-scene',{name:'finite-boundary.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await ready(.025);
 const before=(await state()).pose;await pulse('w',600,'fine-finite-boundary');const stopped=(await state()).pose;assert.ok(stopped.positionLocalM[0]>=model.localBounds.min[0]);assert.ok(Math.hypot(...stopped.positionLocalM.map((x,i)=>x-before.positionLocalM[i]))<=1.01e-6);assert.ok((await events()).some(e=>e.type==='navigation'&&e.reason==='finite-domain'));assert.equal((await state()).runtime.error,null);
}
try {
 for(const kind of ['A','B']) {
  await begin(kind,kind+'-explore');await page.click('#space-mode-landscape');await ready(.1);let s=await state();phase.setup=s.metadata;assert.equal(s.metadata.world.generator.id,'atlas.mandelbrot-parent-chart');assert.equal(s.requestedScene.sampling.profile,'source-parent-bilinear-r1');
  for(const key of ['d','a','e','q'])await pulse(key,600,'three-dimensional-'+key);
  await pulse('w',7000,'coarse-contact');assert.ok((await events()).some(e=>e.type==='contact'&&e.bodyD===.1),kind+' coarse contact');
  const coarse=(await state()).pose;await page.click('#landscape-smaller');await ready(.025);assert.deepEqual((await state()).pose.positionLocalM,coarse.positionLocalM);await page.screenshot({path:path.join(root,kind+'-fine.png')});
  await pulse('w',12000,'fine-contact');assert.ok((await events()).some(e=>e.type==='contact'&&e.bodyD===.025),kind+' fine contact');
  await pulse('s',14000,'leave-contact');const small=(await state()).pose;await page.click('#landscape-larger');await ready(.1);assert.deepEqual((await state()).pose.positionLocalM,small.positionLocalM);
  s=await state();const filename=path.join(root,kind+'-actual-scene.json'),bytes=await download(filename);saved.set(kind,{filename,bytes,pose:s.pose,scene:JSON.parse(bytes)});assert.doesNotMatch(bytes,/\/mnt\/|\/root\/|runtimeId|nonce|token|producer/);
  await page.screenshot({path:path.join(root,kind+'-coarse.png')});
  const list=await events();assert.ok(list.filter(e=>e.type==='frame').every(e=>e.renderRevision===e.collisionRevision));assert.ok(list.filter(e=>e.type==='scale').every(e=>e.displacement===0));
  await boundary(s.metadata,JSON.parse(bytes));
  if(kind==='B') {
   await page.setInputFiles('#landscape-open-scene',saved.get('A').filename);await page.waitForFunction(()=>!atlas.landscape.state.active&&document.querySelector('#landscape-file-status').textContent.includes('not available'),null,{timeout:60000});
   assert.equal((await state()).requestedScene.parameters.world.id,saved.get('A').scene.parameters.world.id);detail.wrongWorldRefused=true;
  }
  await finish();
 }
 pass('Both source worlds enter on maintained headed NVIDIA hardware and contact terrain at both body sizes');
 pass('Source rendering and collision agree while size changes preserve position and finite boundaries stay active');
 assert.notEqual(saved.get('A').scene.parameters.world.definitionKey,saved.get('B').scene.parameters.world.definitionKey);
 for(const kind of ['A','B']) {
  await begin(kind,kind+'-reopen');await page.setInputFiles('#landscape-open-scene',saved.get(kind).filename);await ready(.1);
  const s=await state();phase.setup=s.metadata;assert.deepEqual(s.pose,saved.get(kind).pose);assert.equal(await download(path.join(root,kind+'-reexported.json')),saved.get(kind).bytes);
  assert.notEqual(s.metadata.producer.instanceId,detail.phases.find(p=>p.label===kind+'-explore').setup.producer.instanceId);await pulse('e',600,'reopened-navigation');await finish();
 }
 assert.equal(detail.wrongWorldRefused,true);pass('Both downloaded source places reopen exactly after fresh helpers and browsers and another world refuses');
 detail.pass=true;
} catch(error){detail.failure=error.stack;console.error(detail.failure);report.push({name:'FAIL',error:detail.failure});process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});}
finally {
 if(phase)try{await finish();}catch(error){detail.cleanupFailure=error.message;}
 detail.cleanup=!detail.cleanupFailure&&detail.phases.length>0&&detail.phases.every(p=>p.cleanup);
 if(!detail.cleanup){process.exitCode=125;report.push({name:'FAIL',error:'CLEANUP-UNCONFIRMED'});}
 detail.ended=Date.now();await fs.writeFile(path.join(root,'source-browser.json'),JSON.stringify(detail,null,2)+'\n');
}
if(detail.pass&&detail.cleanup) {
 try {
  const python=process.env.ATLAS_REFERENCE_PYTHON;if(!python)throw Error('CPU audit interpreter required');
  detail.audit=await runBounded({spawnFn:spawn,command:python,args:['scripts/experiments/md2a22-qualify.py',root,'--audit'],timeoutMs:120000,options:{cwd:process.cwd(),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONPATH:'',PYTHONHOME:''}}});
  if(detail.audit.cleanup==='unconfirmed'){detail.cleanup=false;process.exitCode=125;console.error('CLEANUP-UNCONFIRMED independent source motion audit');}assert.notEqual(detail.audit.cleanup,'unconfirmed');assert.equal(detail.audit.exitCode,0,detail.audit.stderr||detail.audit.stdout);pass('Independent delivered-triangle motion audits and all source-world cleanup pass');
 }catch(error){detail.failure=error.stack;detail.pass=false;report.push({name:'FAIL',error:detail.failure});if(process.exitCode!==125)process.exitCode=1;}
}
await fs.writeFile(path.join(root,'source-browser.json'),JSON.stringify(detail,null,2)+'\n');await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/source-worlds-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({root,pass:detail.pass,cleanup:detail.cleanup,failure:detail.failure}));
