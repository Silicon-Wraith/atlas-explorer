import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpaceModeHost } from '../../src/space/mode-host.js';
import { deferred } from '../support/prepared-fixture.mjs';

function mode(gate) { const calls=[];return {calls,async activate(token){calls.push(['activate',token]);if(gate)await gate.promise;return{outcome:'activated'};},deactivate(){calls.push(['deactivate']);},focus(){calls.push(['focus']);},destroy(){calls.push(['destroy']);}}; }
test('Space returns to the last successful mode and holds visibility until its current presentation',async()=>{
 const viewer=mode(),gate=deferred(),landscape=mode(gate),states=[];
 const host=createSpaceModeHost({modes:{viewer,landscape},onState:s=>states.push(s)});await host.activate(1);
 const entering=host.select('landscape');assert.equal(host.inspection.state.visible,'viewer');assert.equal(host.inspection.state.pending,'landscape');gate.resolve();assert.equal((await entering).outcome,'activated');
 host.deactivate();await host.activate(2);assert.equal(host.inspection.state.selected,'landscape');await host.destroy();
});
test('superseded landscape activation never commits visibility or focus',async()=>{
 const viewer=mode(),gate=deferred(),landscape=mode(gate);const host=createSpaceModeHost({modes:{viewer,landscape}});await host.activate(1);
 const old=host.select('landscape');await Promise.resolve();host.deactivate();const next=host.activate(2);gate.resolve();
 assert.equal((await old).outcome,'superseded');assert.equal((await next).outcome,'activated');assert.equal(host.inspection.state.selected,'viewer');assert.equal(landscape.calls.filter(c=>c[0]==='focus').length,0);await host.destroy();
});
test('missing preparation falls back to the viewer inside Space with a reason',async()=>{
 const messages=[],viewer=mode(),landscape={...mode(),activate:async()=>({outcome:'unavailable',reason:'start the local preparer'})};
 const host=createSpaceModeHost({modes:{viewer,landscape},onMessage:m=>messages.push(m)});await host.activate(1);
 assert.equal((await host.select('landscape')).outcome,'activated');assert.equal(host.inspection.state.selected,'viewer');assert.deepEqual(messages,['start the local preparer']);await host.destroy();
});
test('deactivation closes both owners synchronously and repeated pending selection reuses its child work',async()=>{
 const viewer=mode(),gate=deferred(),landscape=mode(gate);const host=createSpaceModeHost({modes:{viewer,landscape}});await host.activate(1);
 const a=host.select('landscape'),b=host.select('landscape');await Promise.resolve();assert.equal(landscape.calls.filter(c=>c[0]==='activate').length,1);
 host.deactivate();assert.equal(viewer.calls.at(-1)[0],'deactivate');assert.equal(landscape.calls.at(-1)[0],'deactivate');gate.resolve();assert.equal((await a).outcome,'superseded');assert.equal((await b).outcome,'superseded');await host.destroy();
});
