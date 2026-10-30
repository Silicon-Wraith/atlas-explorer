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
 owner.close('old-client');assert.throws(()=>owner.begin('old-client'),/closed/);
 const current=owner.begin('new-client');assert.equal(owner.begin('new-client'),current);
 assert.throws(()=>owner.begin('other-client'),/already active/);owner.close('old-client');assert.equal(owner.current(),current);
 owner.close('new-client');owner.close('new-client');assert.deepEqual(released,['new-client']);
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
