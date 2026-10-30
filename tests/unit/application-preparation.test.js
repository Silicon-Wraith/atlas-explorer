import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationRequestAllowed, createApplicationClientOwner } from '../../scripts/preparation/application-policy.mjs';
import { createApplicationPreparationClient } from '../../src/space/preparation/application-client.js';
import { deferred } from '../support/prepared-fixture.mjs';

test('local preparation accepts only the actual Host and same-origin JSON mutations',()=>{
 const base={host:'127.0.0.1:5196',origin:'http://127.0.0.1:5196',method:'POST',contentType:'application/json',port:5196};
 assert.equal(applicationRequestAllowed(base),true);
 for(const patch of [{host:'example.com:5196'},{origin:'https://example.com'},{origin:'null'},{origin:undefined},{contentType:'text/plain'},{method:'DELETE'}])assert.equal(applicationRequestAllowed({...base,...patch}),false);
 assert.equal(applicationRequestAllowed({...base,method:'GET',origin:undefined}),true);
});
test('explicit close before opening prevents a late client reservation and never closes another client',()=>{
 const released=[],owner=createApplicationClientOwner({onClose:value=>released.push(value.id)});
 const nonce='owner-session-nonce';owner.close('old-client',nonce);assert.throws(()=>owner.begin('old-client',nonce),/ended/);
 const current=owner.begin('new-client',nonce);assert.equal(owner.begin('new-client',nonce),current);
 assert.throws(()=>owner.begin('other-client',nonce),/another tab/);owner.close('old-client',nonce);assert.equal(owner.current(),current);
 owner.close('new-client',nonce);owner.close('new-client',nonce);assert.deepEqual(released,['new-client']);
});
test('application client cancellation owns opening even before the response arrives',async()=>{
 const gate=deferred(),calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});if(url.endsWith('/open')){await gate.promise;return{ok:true,json:async()=>({world:'late'})};}return{ok:true,status:200};};
 const client=createApplicationPreparationClient({runtimeId:'late-client',fetcher});const opening=client.open();await client.close();gate.resolve();
 await assert.rejects(opening,/superseded/);assert.ok(calls[0].options.signal.aborted);assert.equal(calls.filter(call=>call.url.endsWith('/close')).length,1);await client.close();
});
test('missing helper is actionable and its absent close endpoint does not claim a resource leak',async()=>{
 const client=createApplicationPreparationClient({runtimeId:'missing-client',fetcher:async()=>({ok:false,status:404})});
 await assert.rejects(client.open(),/npm run dev:world/);await client.close();
});

test('application lease expires at its deadline before the sweep can run',()=>{
 let time=0;const released=[],owner=createApplicationClientOwner({now:()=>time,leaseMs:30000,onClose:c=>released.push(c.id)});
 owner.begin('lease-client','owner-session-nonce');time=29999;assert.ok(owner.require('lease-client','owner-session-nonce'));
 time=30000;assert.throws(()=>owner.require('lease-client','owner-session-nonce'),error=>error.code==='expired');assert.deepEqual(released,['lease-client']);
});

test('another session cannot renew or close the owner and status discloses no capability',()=>{
 const owner=createApplicationClientOwner(),a=owner.begin('first-client','first-session-nonce');
 assert.throws(()=>owner.close(a.id,'other-session-nonce'),error=>error.status===409);
 assert.throws(()=>owner.renew(a.id,'other-session-nonce',1),error=>error.status===409);
 assert.equal(owner.current(),a);assert.equal(JSON.stringify(owner.snapshot()).includes(a.id),false);
 assert.equal(JSON.stringify(owner.snapshot()).includes(a.nonce),false);
});
test('out-of-order renewal cannot extend the accepted deadline',()=>{
 let time=0;const owner=createApplicationClientOwner({now:()=>time}),c=owner.begin('first-client','first-session-nonce');
 time=1000;owner.renew(c.id,c.nonce,2);const deadline=c.expiresAt;time=2000;
 assert.throws(()=>owner.renew(c.id,c.nonce,1),error=>error.code==='sequence');assert.equal(c.expiresAt,deadline);
 time=deadline;assert.throws(()=>owner.renew(c.id,c.nonce,3),error=>error.code==='expired');
});
test('expired cleanup belongs to the closed pair and never the replacement',()=>{
 let time=0;const retired=[],owner=createApplicationClientOwner({now:()=>time,onClose:c=>retired.push(...c.tokens)});
 const a=owner.begin('first-client','first-session-nonce');a.tokens.add('old-token');time=30000;
 const b=owner.begin('second-client','second-session-nonce');b.tokens.add('new-token');
 const old=owner.cleanup(a.id,a.nonce);assert.equal(old.closed,true);assert.deepEqual([...old.tokens],['old-token']);
 owner.close(a.id,a.nonce);assert.equal(owner.current(),b);assert.deepEqual([...b.tokens],['new-token']);assert.deepEqual(retired,['old-token']);
});
test('failed retirement blocks admission while bounded owned work can keep draining',()=>{
 let time=0,draining=true;const healthy=createApplicationClientOwner({now:()=>time,onClose:()=>{assert.equal(draining,true);}});
 healthy.begin('first-client','first-session-nonce');time=30000;assert.ok(healthy.begin('second-client','second-session-nonce'));draining=false;
 time=0;const failed=createApplicationClientOwner({now:()=>time,onClose:()=>{throw Error('retirement failed');}});
 failed.begin('first-client','first-session-nonce');time=30000;
 assert.throws(()=>failed.begin('second-client','second-session-nonce'),error=>error.code==='cleanup-failed');
 assert.equal(failed.snapshot().state,'cleanup-failed');
});
test('tombstone capacity reserves closure for the live owner',()=>{
 const owner=createApplicationClientOwner({maxClosed:2});owner.close('old-client','old-session-nonce');
 const live=owner.begin('live-client','live-session-nonce');
 assert.throws(()=>owner.close('other-client','other-session-nonce'),error=>error.code==='capacity');
 owner.close(live.id,live.nonce);assert.equal(owner.current(),null);
 assert.throws(()=>owner.begin('third-client','third-session-nonce'),error=>error.code==='capacity');
});

function leaseRig(handler,{closeFails=false}={}) {
 let mono=0,wall=0,next=0;const timers=new Map(),lost=[],calls=[];
 const session=sequence=>({protocol:'atlas.preparation.session.v1',leaseMs:30000,remainingMs:30000,heartbeatMs:5000,sequence});
 const response=(data,status=200)=>({ok:status===200,status,json:async()=>data});
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/open'))return response({session:session(0)});
  if(url.endsWith('/heartbeat'))return handler?.(JSON.parse(options.body).sequence,{session,response,options})??response({session:session(JSON.parse(options.body).sequence)});
  if(url.endsWith('/close')&&closeFails)throw TypeError('offline');
  return response({closed:true});
 };
 const client=createApplicationPreparationClient({runtimeId:'lease-client',nonce:'owner-session-nonce',fetcher,onSessionLost:reason=>lost.push(reason),
  now:()=>mono,wallNow:()=>wall,setTimer:(fn,ms)=>{timers.set(++next,{fn,time:mono+ms});return next;},clearTimer:id=>timers.delete(id)});
 return{client,lost,calls,timers,session,response,advance(ms){mono+=ms;wall+=ms;},wallJump(ms){wall+=ms;},
  async nextTimer(){const [id,timer]=[...timers.entries()].sort((a,b)=>a[1].time-b[1].time)[0];const delta=timer.time-mono;mono+=Math.max(0,delta);wall+=Math.max(0,delta);timers.delete(id);timer.fn();await new Promise(resolve=>setImmediate(resolve));}};
}
test('a delayed renewal credits send time and cannot revive an expired permit',async()=>{
 const gate=deferred(),r=leaseRig((seq,{session,response})=>seq===2?gate.promise:response({session:session(seq)}));
 await r.client.open();assert.equal(r.client.check(),true);const renewal=r.client.revalidate();r.advance(30001);
 gate.resolve(r.response({session:r.session(2)}));assert.equal(await renewal,false);assert.equal(r.client.check(),false);assert.equal(r.lost.length,1);
 await r.client.close();assert.equal(r.timers.size,0);
});
test('a late older acknowledgement cannot replace a newer verified renewal',async()=>{
 const gate=deferred(),r=leaseRig((seq,{session,response})=>seq===2?gate.promise:response({session:session(seq)}));
 await r.client.open();const older=r.client.revalidate();r.advance(1000);assert.equal(await r.client.revalidate(),true);
 const remaining=r.client.snapshot().session.remainingMs;r.advance(1000);gate.resolve(r.response({session:r.session(2)}));await older;
 assert.equal(r.client.snapshot().session.sequence,3);assert.equal(r.client.snapshot().session.remainingMs,remaining-1000);assert.equal(r.client.check(),true);await r.client.close();
});
test('hidden return requires a fresh acknowledgement even when background renewal succeeds',async()=>{
 const gate=deferred(),r=leaseRig((seq,{session,response})=>seq===3?gate.promise:response({session:session(seq)}));
 await r.client.open();r.client.pause();await r.nextTimer();assert.equal(r.client.check(),false);
 const checking=r.client.revalidate();assert.equal(r.client.check(),false);gate.resolve(r.response({session:r.session(3)}));
 assert.equal(await checking,true);assert.equal(r.client.check(),true);await r.client.close();
});
test('failed renewal pauses input and a subsequent valid acknowledgement restores it',async()=>{
 const r=leaseRig((seq,{session,response})=>seq===2?Promise.reject(Error('offline')):response({session:session(seq)}));
 await r.client.open();await r.nextTimer();assert.equal(r.client.check(),false);assert.equal(r.lost.length,0);
 await r.nextTimer();assert.equal(r.client.check(),true);await r.client.close();
});
test('wall elapsed stall expires conservatively even when the monotonic clock did not tick',async()=>{
 const r=leaseRig();await r.client.open();r.wallJump(30001);assert.equal(r.client.check(),false);assert.equal(r.lost.length,1);
 assert.equal(r.client.check(),false);assert.equal(r.lost.length,1);await r.client.close();
});
test('only explicit proof of retired resources permits deferring an expired empty session close',async()=>{
 const strict=leaseRig(null,{closeFails:true});await strict.client.open();strict.advance(30001);strict.client.check();await assert.rejects(strict.client.close(),/offline/);
 const retired=leaseRig(null,{closeFails:true});await retired.client.open();retired.advance(30001);retired.client.check();assert.deepEqual(await retired.client.close({allowDeferred:true}),{confirmed:false,expiryBounded:true});assert.equal(retired.timers.size,0);
});
