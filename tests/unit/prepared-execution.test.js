import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserPreparer} from '../../src/space/preparation/browser-preparer.js';
import {createPreparedRenderer} from '../../src/space/render/webgpu/prepared-regions.js';
import {preparedFixture,deferred} from '../support/prepared-fixture.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function artifact(){
 const f=preparedFixture(),q={identity:{runtimeId:'cpu',requestId:'cpu:1',epoch:0},producer:f.producerIdentity,world:{id:f.world.id,definitionKey:f.world.definitionKey},bounds:f.grid.bounds([0,0,0]),intent:'view',requirements:{bodyDiameterM:null,maxErrorM:.04}};
 const out=await f.produce(q);await out.payload.release();return out.result.artifact;
}
function workerRig({ready=true,uploadGate}={}){
 const timers=new Map(),failures=[],uploads=[],retired=[],messages=[];let timerId=0,terminated=0;
 const worker={postMessage:data=>messages.push(data),terminate:()=>terminated++};
 const preparing=createBrowserPreparer({renderer:{upload:async()=>{uploads.push('upload');if(uploadGate)await uploadGate.promise;return{bytes:4};},retire:async item=>retired.push(item)},workerUrl:'synthetic',loadPhysics:()=>assert.fail('View-only data cannot initialize physics'),workerFactory:()=>{if(ready)queueMicrotask(()=>worker.onmessage({data:{type:'ready'}}));return worker;},onFailure:error=>failures.push(error),setTimer:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimer:id=>timers.delete(id)});
 return{preparing,worker,timers,failures,uploads,retired,messages,terminated:()=>terminated};
}
test('idle collision worker errors are terminal and cannot accept a later job or ready message',async()=>{
 const r=workerRig(),p=await r.preparing;r.worker.onerror({message:'cpu worker failed',preventDefault(){}});
 assert.equal(r.failures[0].code,'worker-error');assert.equal(p.capacity().terminal,'worker-error');assert.equal(r.terminated(),1);
 r.worker.onmessage({data:{type:'ready'}});await assert.rejects(p.prepare(await artifact(),{},new AbortController().signal),{code:'worker-error'});assert.equal(p.capacity().workerJobs,0);p.close();assert.equal(r.terminated(),1);
});
test('collision message errors reject all pending work and clear deadline ownership',async()=>{
 const r=workerRig(),p=await r.preparing,a=await artifact(),one=p.prepare(a,{},new AbortController().signal),two=p.prepare(a,{},new AbortController().signal);
 r.worker.onmessageerror();await Promise.all([assert.rejects(one,{code:'worker-message-error'}),assert.rejects(two,{code:'worker-message-error'})]);assert.equal(r.timers.size,0);assert.equal(p.capacity().workerJobs,0);assert.equal(r.uploads.length,0);p.close();
});
test('collision indexing deadline terminates the worker and rejects the owned job',async()=>{
 const r=workerRig(),p=await r.preparing,running=p.prepare(await artifact(),{},new AbortController().signal);
 [...r.timers.values()].find(t=>t.ms===20000).fn();await assert.rejects(running,{code:'worker-timeout'});assert.equal(p.capacity().workerJobs,0);assert.equal(r.terminated(),1);p.close();
});
test('collision startup deadline notifies failure and never leaves an unowned worker',async()=>{
 const r=workerRig({ready:false});[...r.timers.values()].find(t=>t.ms===10000).fn();await assert.rejects(r.preparing,{code:'worker-timeout'});assert.equal(r.terminated(),1);assert.equal(r.timers.size,0);
});
test('a late GPU upload after preparer close is retired instead of published',async()=>{
 const gate=deferred(),r=workerRig({uploadGate:gate}),p=await r.preparing,running=p.prepare(await artifact(),{},new AbortController().signal);
 r.worker.onmessage({data:{id:r.messages[0].id,expanded:new ArrayBuffer(0)}});await tick();p.close();gate.resolve();await assert.rejects(running,/cancelled/);assert.equal(r.retired.length,1);assert.equal(r.failures.length,0);
});
function gpuRig(){
 const lost=deferred(),destroyed=[],errors=[],listeners={},controls={reject:false,gate:null};
 const owned=kind=>({kind,destroy:()=>destroyed.push(kind),createView:()=>({})});
 const device={lost:lost.promise,addEventListener:(name,fn)=>{listeners[name]=fn;},createTexture:()=>owned('depth'),createBuffer:()=>owned('buffer'),createBindGroup:()=>({}),createShaderModule:()=>({getCompilationInfo:async()=>({messages:[]})}),createRenderPipelineAsync:async()=>({getBindGroupLayout:()=>({})}),destroy:()=>{destroyed.push('device');lost.resolve({reason:'destroyed',message:'cpu deliberate destroy'});},queue:{writeBuffer(){},onSubmittedWorkDone:()=>controls.gate?.promise??(controls.reject?Promise.reject(Error('queue drain failed')):Promise.resolve())}};
 const context={configure(){},unconfigure:()=>destroyed.push('context')},canvas={width:4,height:4,getContext:()=>context};
 const gpu={requestAdapter:async()=>({info:{vendor:'cpu-fixture'},requestDevice:async()=>device}),getPreferredCanvasFormat:()=> 'bgra8unorm'};
 return{lost,device,canvas,gpu,destroyed,errors,controls,listeners,create:()=>createPreparedRenderer({canvas,gpu,anchor:[0,0,0],diameter:1,lightDirection:[1,0,0],onError:(message,detail)=>errors.push({message,...detail})})};
}
const triangles=new Float32Array([0,0,0,0,1,0,1,0,0,0,1,0,0,0,1,0,1,0]);
test('known device loss retires every GPU resource whether queue completion resolves or rejects',async()=>{
 const oldBuffer=globalThis.GPUBufferUsage,oldTexture=globalThis.GPUTextureUsage;globalThis.GPUBufferUsage={VERTEX:1,COPY_DST:2,UNIFORM:4};globalThis.GPUTextureUsage={RENDER_ATTACHMENT:1};
 try{for(const rejection of [false,true]){const r=gpuRig(),renderer=await r.create(),a=await artifact();await renderer.upload(a,triangles);await renderer.upload(a,triangles);r.device.destroy();await tick();r.controls.reject=rejection;await renderer.dispose();assert.equal(r.destroyed.filter(x=>x==='buffer').length,4);assert.equal(r.errors.length,1);assert.equal(r.errors[0].code,'device-lost');assert.equal(r.errors[0].epoch,renderer.epoch);}}
 finally{globalThis.GPUBufferUsage=oldBuffer;globalThis.GPUTextureUsage=oldTexture;}
});
test('unrelated GPU retirement errors remain failures while disposal still destroys every region',async()=>{
 const oldBuffer=globalThis.GPUBufferUsage,oldTexture=globalThis.GPUTextureUsage;globalThis.GPUBufferUsage={VERTEX:1,COPY_DST:2,UNIFORM:4};globalThis.GPUTextureUsage={RENDER_ATTACHMENT:1};
 try{const r=gpuRig(),renderer=await r.create(),a=await artifact();await renderer.upload(a,triangles);await renderer.upload(a,triangles);r.controls.reject=true;await assert.rejects(renderer.dispose(),/retirement failed/);assert.equal(r.destroyed.filter(x=>x==='buffer').length,4);assert.ok(r.destroyed.includes('device'));await tick();assert.equal(r.errors.length,0);}
 finally{globalThis.GPUBufferUsage=oldBuffer;globalThis.GPUTextureUsage=oldTexture;}
});
test('a synchronous structured-clone exception is terminal even when its native code is read-only',async()=>{
 const r=workerRig(),p=await r.preparing;r.worker.postMessage=()=>{throw new DOMException('cannot clone','DataCloneError');};
 await assert.rejects(p.prepare(await artifact(),{},new AbortController().signal),{code:'worker-message-error'});assert.equal(r.terminated(),1);assert.equal(p.capacity().workerJobs,0);p.close();
});
