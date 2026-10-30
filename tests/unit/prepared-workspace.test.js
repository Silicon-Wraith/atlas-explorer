import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeBrowser, fakeShell } from '../support/fake-dom.mjs';
import { preparedFixture, deferred } from '../support/prepared-fixture.mjs';
import { createPreparedWorldWorkspace } from '../../src/space/preparation/workspace.js';
import { boundaryViolations } from '../support/import-boundary.mjs';

const browser=installFakeBrowser();
function rig({openGate,consumerGate,sessionGate,closeError,remoteRetirementFailures=0}={}){
 const f=preparedFixture({gate:consumerGate}),doc=browser.document,frames=new Map(),calls=[],clients=[];let seq=0,clientSeq=0;doc.hidden=false;
 const rendererFactory=async({canvas})=>({adapterInfo:{synthetic:true},render:()=>calls.push('render'),done:async()=>{},bytes:()=>1024,resize:async(w,h)=>{canvas.width=w;canvas.height=h;},dispose:async()=>calls.push('renderer-dispose')});
 const clientFactory=options=>{const client={allowed:true,produce:f.produce,check:()=>client.allowed,pause:()=>{client.allowed=false;},revalidate:async()=>{if(sessionGate)await sessionGate.promise;client.allowed=true;return true;},expire(){client.allowed=false;options.onSessionLost('The landscape session expired. Retry Landscape.');},snapshot:()=>({synthetic:true,remoteRetirementFailures,session:{message:'Checking the landscape session…'}}),cancelOpening:()=>calls.push('cancel-open'),close:async options=>{calls.push('client-close');client.closeOptions=options;if(closeError)throw Error(closeError);},open:async()=>{
  if(openGate)await openGate.promise;return{world:f.world,producer:f.producerIdentity,grid:f.grid.config,viewGrid:f.viewGrid.config,fineBounds:f.fineBounds,feature:{point:[-1,-1,-1],light:[1,0,0]}};
 }};clients.push(client);return client;};
 const preparerFactory=async()=>({prepare:f.prepare,capacity:()=>({synthetic:true}),close:()=>{calls.push('worker-close');consumerGate?.resolve();}});
 const workspace=createPreparedWorldWorkspace({shell:fakeShell(doc),workerUrl:'synthetic',loadPhysics:()=>{},rendererFactory,preparerFactory,clientFactory,env:{document:doc,window:globalThis,runtimeId:()=>`workspace-client-${++clientSeq}`,requestFrame:fn=>{frames.set(++seq,fn);return seq;},cancelFrame:id=>frames.delete(id)}});
 const runFrame=(time=performance.now()+20)=>{const due=[...frames.values()];frames.clear();for(const fn of due)fn(time);};
 return{workspace,calls,clients,f,doc,frames,runFrame,canvas:doc.querySelector('#landscape-canvas')};
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
