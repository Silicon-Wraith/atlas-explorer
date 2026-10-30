import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createNativeController} from '../../scripts/preparation/native-controller.mjs';

function rig(){
 const child=new EventEmitter(),writes=[],records=[],events=[];let exited=false;
 child.pid=43210;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new EventEmitter();
 const exit=(code=null,signal='SIGKILL')=>{if(exited)return;exited=true;child.emit('close',code,signal);};
 child.stdin.write=value=>{writes.push(value);if(exited)throw Error('write to a closed fake pipe');};
 child.stdin.end=value=>{writes.push(value);queueMicrotask(()=>exit(0,null));};child.kill=signal=>{exit(null,signal);return true;};
 const controller=createNativeController({bundle:'synthetic',output:'/mnt/ml_storage/scratch/atlas-bi1c/fake-controller',spawnWorker:()=>child,writeRecord:async(...args)=>records.push(args),onEvent:e=>events.push(e)});
 child.stdout.write(JSON.stringify({type:'ready',producer:{instanceId:'fake-native',epoch:0}})+'\n');
 return{controller,child,writes,records,events,exit};
}
const request={identity:{runtimeId:'fake-runtime',requestId:'fake-request',epoch:0},producer:{instanceId:'fake-native',epoch:0}};
test('native controller rejects new work immediately after observed exit without writing to the dead pipe',async()=>{
 const r=rig();await r.controller.ready;r.exit();const before=r.writes.length;
 try{await assert.rejects(r.controller.run(request),{code:'preparer-lost'});assert.equal(r.writes.length,before);await assert.rejects(r.controller.reset(),{code:'preparer-lost'});}
 finally{await r.controller.close();}
});
test('native exit rejects outstanding work with a typed cause and close remains confirmed and idempotent',async()=>{
 const r=rig();await r.controller.ready;const running=r.controller.run(request);r.exit();await assert.rejects(running,{code:'preparer-lost'});
 const first=r.controller.close(),second=r.controller.close();assert.equal(first,second);const receipt=await first;
 assert.equal(receipt.cleanup,true);assert.equal(receipt.exit.signal,'SIGKILL');assert.equal(r.records.length,1);assert.equal(r.events.filter(e=>e.type==='worker-exit').length,1);
});
test('intentional native close is confirmed once and suppresses future work',async()=>{
 const r=rig();await r.controller.ready;const receipt=await r.controller.close();assert.equal(receipt.cleanup,true);assert.equal(receipt.stopped,false);
 await r.controller.close();assert.equal(r.records.length,1);await assert.rejects(r.controller.run(request));
});
