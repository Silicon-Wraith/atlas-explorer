import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeBrowser, fakeShell } from '../support/fake-dom.mjs';
import { preparedFixture, deferred } from '../support/prepared-fixture.mjs';
import { createPreparedWorldWorkspace } from '../../src/space/preparation/workspace.js';
import { boundaryViolations } from '../support/import-boundary.mjs';

const browser=installFakeBrowser();
function rig({openGate,consumerGate}={}){
 const f=preparedFixture({gate:consumerGate}),doc=browser.document,frames=new Map(),calls=[];let seq=0,clientSeq=0;
 const rendererFactory=async({canvas})=>({adapterInfo:{synthetic:true},render:()=>calls.push('render'),done:async()=>{},bytes:()=>1024,resize:async(w,h)=>{canvas.width=w;canvas.height=h;},dispose:async()=>calls.push('renderer-dispose')});
 const clientFactory=()=>({produce:f.produce,snapshot:()=>({synthetic:true}),cancelOpening:()=>calls.push('cancel-open'),close:async()=>calls.push('client-close'),open:async()=>{
  if(openGate)await openGate.promise;return{world:f.world,producer:f.producerIdentity,grid:f.grid.config,viewGrid:f.viewGrid.config,fineBounds:f.fineBounds,feature:{point:[-1,-1,-1],light:[1,0,0]}};
 }});
 const preparerFactory=async()=>({prepare:f.prepare,capacity:()=>({synthetic:true}),close:()=>{calls.push('worker-close');consumerGate?.resolve();}});
 const workspace=createPreparedWorldWorkspace({shell:fakeShell(doc),workerUrl:'synthetic',loadPhysics:()=>{},rendererFactory,preparerFactory,clientFactory,env:{document:doc,window:globalThis,runtimeId:()=>`workspace-client-${++clientSeq}`,requestFrame:fn=>{frames.set(++seq,fn);return seq;},cancelFrame:id=>frames.delete(id)}});
 const runFrame=(time=performance.now()+20)=>{const due=[...frames.values()];frames.clear();for(const fn of due)fn(time);};
 return{workspace,calls,f,doc,frames,runFrame,canvas:doc.querySelector('#landscape-canvas')};
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
