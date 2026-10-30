import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublications } from '../../scripts/preparation/publications.mjs';
const identity={runtimeId:'browser',epoch:1,requestId:'r1'};
test('cancellation before the response token prevents late publication',()=>{
 const retired=[],p=createPublications({onRetire:value=>retired.push(value)});p.cancel(identity);
 assert.equal(p.publish('late',{identity}),false);assert.equal(p.size(),0);assert.deepEqual(retired,[]);
});
test('cancellation after publication retires an unknown client token exactly once',()=>{
 const retired=[],p=createPublications({onRetire:(value,token)=>retired.push(token)});
 assert.equal(p.publish('unknown',{identity}),true);p.cancel(identity);p.retire('unknown');p.cancel(identity);
 assert.equal(p.size(),0);assert.deepEqual(retired,['unknown']);p.reset();assert.equal(p.publish('new',{identity}),true);
});
test('request retirement cannot cancel another runtime or producer epoch',()=>{
 const p=createPublications();p.publish('other',{identity:{...identity,epoch:2}});p.publish('other-runtime',{identity:{...identity,runtimeId:'new'}});p.cancel(identity);assert.equal(p.size(),2);assert.throws(()=>p.reset(),/Unretired/);p.clear();assert.equal(p.size(),0);
});
