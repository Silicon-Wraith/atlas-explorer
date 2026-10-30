import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeBrowser, fakeShell } from '../support/fake-dom.mjs';
import { preparedFixture, deferred } from '../support/prepared-fixture.mjs';
import { createPreparedWorldWorkspace } from '../../src/space/preparation/workspace.js';
import { createPreparedScene, encodeSceneFile, decodeSceneFile } from '../../src/space/preparation/scene-adapter.js';
import { createSpaceModeHost } from '../../src/space/mode-host.js';
import { createPreparationResult } from '../../src/space/preparation/contract.js';
import { boundaryViolations } from '../support/import-boundary.mjs';

const browser=installFakeBrowser();
function rig({openGate,consumerGate,sessionGate,closeError,remoteRetirementFailures=0,classification='empty-air',onRestoreRequested,fileReadMs,produceFactory,scaleIntentMs}={}){
 const f=preparedFixture({gate:consumerGate,classification}),doc=browser.document,frames=new Map(),calls=[],clients=[];let seq=0,clientSeq=0,nextConsumer=null,bodyBlocked=false;const consuming=deferred(),consumerWaits=new Set(),downloads=[];doc.hidden=false;
 const rendererFactory=async({canvas})=>({adapterInfo:{synthetic:true},render:()=>calls.push('render'),done:async()=>{},bytes:()=>1024,resize:async(w,h)=>{canvas.width=w;canvas.height=h;},dispose:async()=>calls.push('renderer-dispose')});
 const produce=produceFactory?produceFactory(f):f.produce;
 const clientFactory=options=>{const client={allowed:true,produce,check:()=>client.allowed,pause:()=>{client.allowed=false;},revalidate:async()=>{if(sessionGate)await sessionGate.promise;client.allowed=true;return true;},expire(){client.allowed=false;options.onSessionLost('The landscape session expired. Retry Landscape.');},snapshot:()=>({synthetic:true,remoteRetirementFailures,session:{message:'Checking the landscape session…'}}),cancelOpening:()=>calls.push('cancel-open'),close:async options=>{calls.push('client-close');client.closeOptions=options;if(closeError)throw Error(closeError);},open:async()=>{
  if(openGate)await openGate.promise;return{world:f.world,producer:f.producerIdentity,grid:f.grid.config,viewGrid:f.viewGrid.config,fineBounds:f.fineBounds,feature:{point:[-1,-1,-1],light:[1,0,0]}};
 }};clients.push(client);return client;};
 const preparerFactory=async()=>({prepare:async(...args)=>{if(nextConsumer){const gate=nextConsumer;nextConsumer=null;consumerWaits.add(gate);consuming.resolve();await gate.promise;consumerWaits.delete(gate);}const receipt=await f.prepare(...args);if(receipt.lease.value.collider)receipt.lease.value.collider.containsPoint=()=>bodyBlocked;return receipt;},capacity:()=>({synthetic:true}),close:()=>{calls.push('worker-close');consumerGate?.resolve();for(const gate of consumerWaits)gate.resolve();}});
 const workspace=createPreparedWorldWorkspace({shell:fakeShell(doc),workerUrl:'synthetic',loadPhysics:()=>{},rendererFactory,preparerFactory,clientFactory,onRestoreRequested,env:{document:doc,window:globalThis,fileReadMs,scaleIntentMs,download:(blob,name)=>downloads.push({blob,name}),runtimeId:()=>`workspace-client-${++clientSeq}`,requestFrame:fn=>{frames.set(++seq,fn);return seq;},cancelFrame:id=>frames.delete(id)}});
 const runFrame=(time=performance.now()+20)=>{const due=[...frames.values()];frames.clear();for(const fn of due)fn(time);};
 return{workspace,calls,clients,f,doc,frames,runFrame,downloads,consuming,pauseNextConsumer:gate=>{nextConsumer=gate;},blockBody:value=>{bodyBlocked=value;},canvas:doc.querySelector('#landscape-canvas')};
}
test('prepared workspace stops input on leave and re-enters the retained pose after releasing resources',async()=>{
 const r=rig();assert.equal((await r.workspace.activate(1)).outcome,'activated');r.workspace.focus();
 globalThis.dispatchEvent({type:'keydown',key:'w'});r.runFrame();const moved=r.workspace.inspection.state.pose;assert.notDeepEqual(moved.positionLocalM,[0,0,0]);
 r.workspace.deactivate();assert.equal(r.workspace.inspection.state.active,false);assert.equal(r.frames.size,0);globalThis.dispatchEvent({type:'keydown',key:'w'});r.runFrame();
 await r.workspace.inspection.whenReleased();assert.deepEqual(r.workspace.inspection.state.pose,moved);assert.ok(r.calls.includes('renderer-dispose'));assert.ok(r.calls.includes('client-close'));
 await r.workspace.activate(2);assert.deepEqual(r.workspace.inspection.state.pose,moved);await r.workspace.destroy();
});
test('leaving during opening cannot create a late device or change the retained investigation',async()=>{
 const gate=deferred(),r=rig({openGate:gate});const opening=r.workspace.activate(1);await Promise.resolve();r.workspace.deactivate();gate.resolve();
 assert.equal((await opening).outcome,'superseded');await r.workspace.inspection.whenReleased();assert.equal(r.calls.filter(c=>c==='render').length,0);assert.equal(r.workspace.inspection.state.active,false);await r.workspace.destroy();
});
test('a late prepared consumer is retired without a current first presentation',async()=>{
 const gate=deferred(),r=rig({consumerGate:gate}),opening=r.workspace.activate(1);await r.f.preparing.promise;r.workspace.deactivate();
 assert.equal((await opening).outcome,'superseded');await r.workspace.inspection.whenReleased();assert.equal(r.workspace.inspection.events().filter(e=>e.type==='first-presented').length,0);assert.ok(r.f.released.includes('consumer'));await r.workspace.destroy();
});
test('application worker has one lazy dependency at composition, outside Space core',async()=>{
 const findings=await boundaryViolations(['src/preparation-worker.js'],[/^src\/space\//,/^src\/shared\//,/^src\/preparation-(?:bootstrap|worker)\.js$/]);
 assert.deepEqual(findings.filter(v=>v.kind!=='global'),[{file:'src/preparation-bootstrap.js',kind:'dynamic-import',detail:'1 dynamic import(s)'}]);
});

test('a returning page cannot move scale orient or predict before server verification',async()=>{
 const gate=deferred(),r=rig({sessionGate:gate});await r.workspace.activate();r.workspace.focus();const pose=r.workspace.inspection.state.pose,requests=r.f.requests.length;
 r.doc.hidden=true;r.doc.dispatchEvent({type:'visibilitychange'});r.doc.hidden=false;r.doc.dispatchEvent({type:'visibilitychange'});
 globalThis.dispatchEvent({type:'keydown',key:'w'});r.workspace.inspection.look(1,.3);assert.equal(await r.workspace.inspection.scale(true),false);r.runFrame();
 assert.deepEqual(r.workspace.inspection.state.pose,pose);assert.equal(r.f.requests.length,requests);
 gate.resolve();await new Promise(resolve=>setImmediate(resolve));globalThis.dispatchEvent({type:'keydown',key:'w'});r.runFrame();assert.notDeepEqual(r.workspace.inspection.state.pose.positionLocalM,pose.positionLocalM);await r.workspace.destroy();
});
test('expired workspace retires before explicit retry and old callbacks cannot stop its replacement',async()=>{
 const r=rig();await r.workspace.activate();r.workspace.focus();globalThis.dispatchEvent({type:'keydown',key:'w'});r.runFrame();const pose=r.workspace.inspection.state.pose,old=r.clients[0];
 old.expire();assert.equal(r.workspace.inspection.state.active,false);assert.equal(r.frames.size,0);await r.workspace.inspection.whenReleased();
 assert.equal(r.workspace.inspection.state.phase,'expired');assert.ok(r.calls.includes('renderer-dispose'));await r.workspace.activate();assert.deepEqual(r.workspace.inspection.state.pose,pose);
 old.expire();assert.equal(r.workspace.inspection.state.active,true);assert.equal(r.clients.length,2);await r.workspace.destroy();
});
test('actual local cleanup failure stays sticky and prevents a new session',async()=>{
 const r=rig({closeError:'client close failed'});await r.workspace.activate();r.workspace.deactivate();await assert.rejects(r.workspace.inspection.whenReleased(),/client close failed/);
 assert.equal((await r.workspace.activate()).outcome,'unavailable');assert.equal(r.clients.length,1);await assert.rejects(r.workspace.destroy(),/client close failed/);
});
test('expired workspace cannot defer close after an unconfirmed remote retirement',async()=>{
 const r=rig({remoteRetirementFailures:1,closeError:'remote close unconfirmed'});await r.workspace.activate();r.clients[0].expire();
 await assert.rejects(r.workspace.inspection.whenReleased(),/remote close unconfirmed/);assert.equal(r.clients[0].closeOptions.allowDeferred,false);
 assert.equal((await r.workspace.activate()).outcome,'unavailable');await assert.rejects(r.workspace.destroy(),/remote close unconfirmed/);
});

const requestedFile = (r, x, patch={}) => encodeSceneFile(createPreparedScene({world:r.f.world,pose:r.f.poseModel.create({positionLocalM:[x,0,0],...patch}),lightDirection:[1,0,0]}));
test('live navigation commits one camera entry only on settlement and export saves its accepted pose', async()=>{
 const r=rig();await r.workspace.activate();r.workspace.focus();const before=r.workspace.inspection.history;
 globalThis.dispatchEvent({type:'keydown',key:'e'});for(let i=0;i<10;i++)r.runFrame(performance.now()+20+i*20);
 assert.equal(r.workspace.inspection.history.camera.length,before.camera.length);
 const moved=r.workspace.inspection.state.pose;globalThis.dispatchEvent({type:'keyup',key:'e'});
 assert.equal(r.workspace.inspection.history.camera.length,before.camera.length+1);assert.equal(r.workspace.inspection.history.undoDepth,0);
 const exported=r.workspace.inspection.saveScene();assert.deepEqual(decodeSceneFile(exported).camera.positionLocalM,moved.positionLocalM);
 assert.equal(r.downloads.length,1);assert.equal(await r.downloads[0].blob.text(),exported);await r.workspace.destroy();
});
test('scene restore and Back Forward Undo Redo publish exact requested poses after fresh coverage',async()=>{
 const r=rig();await r.workspace.activate();const initial=r.workspace.inspection.state.pose;
 assert.equal((await r.workspace.inspection.openSceneText(requestedFile(r,.1))).ok,true);assert.deepEqual(r.workspace.inspection.state.pose.positionLocalM,[.1,0,0]);
 assert.equal(r.workspace.inspection.history.undoDepth,1);
 await r.workspace.inspection.undo();assert.deepEqual(r.workspace.inspection.state.pose,initial);
 await r.workspace.inspection.redo();assert.deepEqual(r.workspace.inspection.state.pose.positionLocalM,[.1,0,0]);
 await r.workspace.inspection.back();assert.deepEqual(r.workspace.inspection.state.pose,initial);
 await r.workspace.inspection.forward();assert.deepEqual(r.workspace.inspection.state.pose.positionLocalM,[.1,0,0]);await r.workspace.destroy();
});
test('a newer requested scene wins while the prior restored consumer is delayed',async()=>{
 const r=rig();await r.workspace.activate();const gate=deferred();r.pauseNextConsumer(gate);
 const b=r.workspace.inspection.openSceneText(requestedFile(r,.1));await r.consuming.promise;
 const c=r.workspace.inspection.openSceneText(requestedFile(r,.2));
 assert.equal((await b).superseded,true);assert.equal((await c).ok,true);
 assert.deepEqual(r.workspace.inspection.state.requestedScene.camera.positionLocalM,[.2,0,0]);assert.deepEqual(r.workspace.inspection.state.pose.positionLocalM,[.2,0,0]);await r.workspace.destroy();
});
test('leaving a pending restore preserves its request and cannot publish it until explicit re-entry',async()=>{
 const r=rig();await r.workspace.activate();const initial=r.workspace.inspection.state.pose,gate=deferred();r.pauseNextConsumer(gate);
 const pending=r.workspace.inspection.openSceneText(requestedFile(r,.1));await r.consuming.promise;r.workspace.deactivate();assert.equal((await pending).ok,false);await r.workspace.inspection.whenReleased();
 assert.deepEqual(r.workspace.inspection.state.pose,initial);assert.deepEqual(r.workspace.inspection.state.requestedScene.camera.positionLocalM,[.1,0,0]);
 await r.workspace.activate();assert.deepEqual(r.workspace.inspection.state.pose.positionLocalM,[.1,0,0]);await r.workspace.destroy();
});
test('compatibility and body-clearance failures keep requested scenes and Retry never uses the old pose',async()=>{
 const r=rig({classification:'surface'});await r.workspace.activate();const before=r.workspace.inspection.state.pose;
 const supported=requestedFile(r,.1),unsupported=JSON.parse(supported);unsupported.camera.positionLocalM=[99,0,0];
 assert.equal((await r.workspace.inspection.openSceneText(JSON.stringify(unsupported))).ok,false);assert.deepEqual(r.workspace.inspection.state.requestedScene.camera.positionLocalM,[99,0,0]);
 assert.deepEqual(r.workspace.inspection.state.pose,before);assert.equal((await r.workspace.activate()).outcome,'unavailable');
 r.blockBody(true);assert.equal((await r.workspace.inspection.openSceneText(supported)).ok,false);assert.deepEqual(r.workspace.inspection.state.requestedScene.camera.positionLocalM,[.1,0,0]);
 r.blockBody(false);assert.equal((await r.workspace.activate()).outcome,'activated');assert.deepEqual(r.workspace.inspection.state.pose.positionLocalM,[.1,0,0]);await r.workspace.destroy();
});
test('viewer fallback activated cannot report a pending Landscape file as successfully opened',async()=>{
 const r=rig({onRestoreRequested:async()=>({outcome:'activated'})});const result=await r.workspace.inspection.openSceneText(requestedFile(r,.1));
 assert.equal(result.ok,false);assert.equal(r.workspace.inspection.state.active,false);assert.equal(r.workspace.inspection.history,null);assert.deepEqual(r.workspace.inspection.state.requestedScene.camera.positionLocalM,[.1,0,0]);await r.workspace.destroy();
});
test('mode-host restart preserves a file requested during the first activation without falling back',async()=>{
 let host;const gate=deferred(),messages=[],r=rig({openGate:gate,onRestoreRequested:()=>host.restart('landscape')});
 const viewer={activate:async()=>({outcome:'activated'}),deactivate(){},destroy(){}};host=createSpaceModeHost({modes:{viewer,landscape:r.workspace},onMessage:x=>messages.push(x)});await host.activate();
 const entering=host.select('landscape');await new Promise(resolve=>setImmediate(resolve));const restored=r.workspace.inspection.openSceneText(requestedFile(r,.1));
 assert.equal(r.workspace.inspection.history,null);gate.resolve();assert.equal((await entering).outcome,'superseded');assert.equal((await restored).ok,true);
 assert.equal(host.inspection.state.selected,'landscape');assert.equal(r.workspace.inspection.history.undoDepth,1);assert.deepEqual(messages,[]);assert.deepEqual(r.workspace.inspection.state.pose.positionLocalM,[.1,0,0]);await host.destroy();
});
test('invalid or superseded file reads cannot replace a newer requested scene and reads are bounded',async()=>{
 const r=rig({fileReadMs:20});await r.workspace.activate();const before=r.workspace.inspection.history,gate=deferred();
 const old=r.workspace.inspection.openSceneFile({size:10,text:()=>gate.promise});const current=await r.workspace.inspection.openSceneText(requestedFile(r,.2));gate.resolve(requestedFile(r,.1));
 assert.equal(current.ok,true);assert.equal((await old).superseded,true);assert.deepEqual(r.workspace.inspection.state.pose.positionLocalM,[.2,0,0]);
 const stable=r.workspace.inspection.history;assert.equal((await r.workspace.inspection.openSceneText('{')).ok,false);assert.deepEqual(r.workspace.inspection.history,stable);
 const timeout=await r.workspace.inspection.openSceneFile({size:10,text:()=>new Promise(()=>{})});assert.match(timeout.error,/timed out/);assert.deepEqual(r.workspace.inspection.history,stable);await r.workspace.destroy();
});

const flushScaleWork=()=>new Promise(resolve=>setImmediate(resolve));
async function deferredScaleRig(options={}){
 const gate=deferred(),retry=deferred();let fineRequests=0;
 const r=rig({...options,produceFactory:f=>async q=>{
  if(q.requirements.bodyDiameterM!==.25)return f.produce(q);
  fineRequests++;
  if(fineRequests===1)return{result:createPreparationResult({schema:'atlas.preparation.result',schemaVersion:1,identity:q.identity,producer:q.producer,status:'unsupported',reason:'Native queue capacity; retry after deferral',artifact:null})};
  retry.resolve();await gate.promise;return f.produce(q);
 }});
 await r.workspace.activate();r.workspace.focus();const began=performance.now();
 const pending=r.workspace.inspection.scale(true,{discrete:true});await flushScaleWork();r.runFrame(began+200);await retry.promise;
 return{...r,gate,pending,began,fineRequests:()=>fineRequests};
}
test('one scale gesture survives capacity deferral until prepared coverage and commits one camera entry',async()=>{
 const r=await deferredScaleRig();
 try{
  for(let i=3;i<12;i++){r.runFrame(r.began+i*100);await flushScaleWork();}
  assert.equal(r.fineRequests(),2);assert.equal(r.workspace.inspection.state.pose.bodyDiameterM,1);
  assert.match(r.doc.querySelector('#landscape-status').textContent,/Preparing smaller formations/);
  r.gate.resolve();await flushScaleWork();r.runFrame(r.began+1300);
  assert.equal(r.workspace.inspection.state.pose.bodyDiameterM,.25);
  assert.equal(await r.pending,true);assert.equal(r.workspace.inspection.events().filter(e=>e.type==='scale').length,1);
  assert.equal(r.workspace.inspection.history.camera.length,2);assert.equal(r.workspace.inspection.history.undoDepth,0);
 }finally{r.gate.resolve();await r.workspace.destroy();}
});
test('cancelled deferred scale cannot apply after reversal leave restore session loss or lost focus',async t=>{
 for(const action of ['reverse','leave','restore','session-loss','focus-loss'])await t.test(action,async()=>{
  const r=await deferredScaleRig();let restore;
  try{
   if(action==='reverse')await r.workspace.inspection.scale(false);
   if(action==='leave')r.workspace.deactivate();
   if(action==='restore')restore=r.workspace.inspection.openSceneText(requestedFile(r,.1));
   if(action==='session-loss')r.clients[0].expire();
   if(action==='focus-loss')globalThis.dispatchEvent({type:'blur'});
   r.gate.resolve();await flushScaleWork();if(restore)assert.equal((await restore).ok,true);
   r.runFrame(r.began+400);assert.equal(await r.pending,false);
   assert.equal(r.workspace.inspection.state.pose.bodyDiameterM,1);
   assert.equal(r.workspace.inspection.events().filter(e=>e.type==='scale').length,0);
   if(action==='restore')assert.deepEqual(r.workspace.inspection.state.pose.positionLocalM,[.1,0,0]);
   if(action==='session-loss')assert.match(r.doc.querySelector('#landscape-status').textContent,/expired/);
   assert.doesNotMatch(r.doc.querySelector('#landscape-status').textContent,/Move into the prepared detail area/);
  }finally{r.gate.resolve();await r.workspace.destroy();}
  assert.equal(r.f.released.filter(x=>x==='payload').length,r.f.requests.length);
 });
});
test('deferred scale expires honestly and late ready coverage cannot change the pose',async()=>{
 const r=await deferredScaleRig();
 try{
  r.runFrame(r.began+9000);assert.equal(await r.pending,false);
  assert.match(r.doc.querySelector('#landscape-status').textContent,/not ready yet.*try again/i);
  r.gate.resolve();await flushScaleWork();r.runFrame(r.began+9100);
  assert.equal(r.workspace.inspection.state.pose.bodyDiameterM,1);
  assert.equal(r.workspace.inspection.events().filter(e=>e.type==='scale').length,0);
 }finally{r.gate.resolve();await r.workspace.destroy();}
});
test('deferred scale still checks the current body clearance when coverage arrives',async()=>{
 const r=await deferredScaleRig({classification:'surface'}),before=r.workspace.inspection.state.pose;
 try{
  r.blockBody(true);r.gate.resolve();await flushScaleWork();r.runFrame(r.began+400);
  assert.equal(await r.pending,false);assert.deepEqual(r.workspace.inspection.state.pose,before);
  assert.match(r.doc.querySelector('#landscape-status').textContent,/clear.*detail coverage/i);
  assert.equal(r.workspace.inspection.events().filter(e=>e.type==='scale').length,0);
 }finally{r.gate.resolve();await r.workspace.destroy();}
});
