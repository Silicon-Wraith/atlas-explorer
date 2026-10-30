import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreparedRuntime } from '../../src/space/preparation/runtime.js';
import { preparedFixture, deferred } from '../support/prepared-fixture.mjs';

test('application runtime publishes compatible resources, moves only inside prepared coverage and releases them',async()=>{
 const f=preparedFixture(),runtime=createPreparedRuntime(f.config);await runtime.start(f.poseModel.create());
 assert.equal(runtime.snapshot().active,'0,0,0');const first=runtime.frame();assert.equal(first.active.artifact.intent,'interaction');assert.equal(first.view.artifact.intent,'view');
 for(let i=0;i<9;i++)assert.equal(runtime.move([.05,0,0]).waiting,false);
 const before=runtime.pose();assert.equal(runtime.move([.05,0,0]).waiting,true);assert.deepEqual(runtime.pose(),before);
 const result=await runtime.suspend();assert.equal(result.cleanup,true);assert.equal(result.session.live,0);
 assert.equal(f.released.filter(x=>x==='consumer').length,f.requests.length);assert.equal(f.released.filter(x=>x==='payload').length,f.requests.length);
 assert.throws(()=>runtime.move([.01,0,0]),/active runtime/);
});
test('leaving during consumer work invalidates publication immediately and drains the late resource',async()=>{
 const gate=deferred(),f=preparedFixture({gate}),runtime=createPreparedRuntime(f.config);const activation=runtime.start(f.poseModel.create());
 await f.preparing.promise;const closed=runtime.suspend();assert.equal(runtime.snapshot().active,null);gate.resolve();
 await assert.rejects(activation,/superseded/);assert.equal((await closed).session.live,0);assert.deepEqual(f.released,['consumer','payload']);
});
test('retirement remains owned until physical release and fine dependency survives a scale round trip',async()=>{
 const releaseGate=deferred(),f=preparedFixture({releaseGate}),runtime=createPreparedRuntime(f.config);await runtime.start(f.poseModel.create());
 await runtime.requestFine();assert.equal(runtime.scale(true),true);assert.equal(runtime.snapshot().active,'fine');
 assert.ok(runtime.snapshot().resident.includes('0,0,0'));const before=runtime.pose().positionLocalM;assert.equal(runtime.scale(false),true);
 assert.deepEqual(runtime.pose().positionLocalM,before);assert.equal(runtime.snapshot().ownedInteraction,2);
 const closed=runtime.suspend();assert.equal(runtime.snapshot().session.closed,true);releaseGate.resolve();assert.equal((await closed).session.live,0);
});
test('constant-air decisions are not reported as first surface casts',async()=>{
 for(const classification of ['empty-air','surface']){
  const f=preparedFixture({classification}),runtime=createPreparedRuntime(f.config);await runtime.start(f.poseModel.create());runtime.move([.01,0,0]);runtime.move([.01,0,0]);
  const queries=f.events.filter(e=>e.type==='navigation');assert.equal(queries[0].firstSurface,classification==='surface');assert.equal(queries[1].firstSurface,false);await runtime.suspend();
 }
});
