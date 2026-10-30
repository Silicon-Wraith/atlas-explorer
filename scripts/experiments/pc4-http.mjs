// Native-free HTTP/session integration. No browser, Python, native job or GPU.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createApplicationServer } from '../preparation/application-server.mjs';
import { createPreparationRequest, worldReference } from '../../src/space/preparation/contract.js';
import { preparedFixture, deferred } from '../../tests/support/prepared-fixture.mjs';

const root=path.resolve(process.argv[2]??process.env.ATLAS_SESSION_HTTP_ROOT??'/mnt/ml_storage/scratch/atlas-pc4/http-'+new Date().toISOString().replace(/[:.]/g,'-'));assert.ok(root.startsWith('/mnt/ml_storage/scratch/atlas-pc4/'));await fs.mkdir(root);
const fixture=preparedFixture(),report={nativeFree:true,started:Date.now(),checks:[],cleanup:false};let time=0,service,factoryCalls=0;
await fs.writeFile(path.join(root,'feature-r0.json'),JSON.stringify({world_point:[0,0,-1],light_direction:[1,0,0]}));
await fs.writeFile(path.join(root,'certificate.json'),'{}');
const values=new Map(),retired=[],cancelled=[];let number=0,hold=null,entered=null,active=0,fault=false;
const adapter={world:fixture.world,grid:fixture.grid,viewGrid:fixture.viewGrid,fineBounds:fixture.fineBounds,
 producer:()=>fixture.producerIdentity,installCertificate(){},hello:()=>({approach:{entry:[0,0,0],inspection_eye:[0,0,0],target:[0,0,-1],fine_origin:[0,0,0],d:.25}}),
 async prepare(q){if(hold){const gate=hold;hold=null;active++;entered.resolve();await gate.promise;active--;}const output=await fixture.produce(q),token='publication-'+(++number);values.set(token,q.identity);return{result:output.result,token};},
 async buffer(){return Buffer.alloc(0);},retire(token){if(fault)throw Error('injected retirement failure');if(values.delete(token))retired.push(token);},
 cancelRequest(identity){cancelled.push(identity.requestId);for(const[token,value]of values)if(value.runtimeId===identity.runtimeId&&value.requestId===identity.requestId)adapter.retire(token);},
 snapshot:()=>({queue:{active,queued:0},publications:values.size}),async close(){values.clear();return{cleanup:true,fake:true};}
};
const base='http://127.0.0.1:5199',a={id:'first-client',nonce:'first-session-nonce'},b={id:'second-client',nonce:'second-session-nonce'},c={id:'third-client',nonce:'third-session-nonce'};
const headers=client=>({'Content-Type':'application/json',Origin:base,'X-Atlas-Client':client.id,'X-Atlas-Session':client.nonce});
const send=(client,endpoint,body={})=>fetch(base+'/api/preparation/'+endpoint,{method:'POST',headers:headers(client),body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
const q=(client,n)=>createPreparationRequest({schema:'atlas.preparation.request',schemaVersion:1,identity:{runtimeId:client.id,requestId:client.id+':'+n,epoch:0},producer:fixture.producerIdentity,world:worldReference(fixture.world),bounds:fixture.grid.bounds([0,0,0]),intent:'interaction',requirements:{bodyDiameterM:1,maxErrorM:.01}});
const check=name=>report.checks.push(name);
try{
 service=await createApplicationServer({runRoot:root,port:5199,bundle:root,certificatePath:path.join(root,'certificate.json'),now:()=>time,adapterFactory:async()=>{factoryCalls++;return adapter;}});
 const initial=await(await fetch(base+'/api/preparation/status')).json();assert.equal(initial.session.state,'available');assert.equal(factoryCalls,0);check('Passive status never constructs the fake or native adapter');
 assert.equal((await send(a,'open',{runtimeId:a.id})).status,200);
 const status=JSON.stringify(await(await fetch(base+'/api/preparation/status')).json());assert.ok(!status.includes(a.id)&&!status.includes(a.nonce));
 const spoof={id:a.id,nonce:b.nonce};assert.equal((await send(spoof,'close',{runtimeId:a.id})).status,409);
 const prepared=await(await send(a,'prepare',q(a,1))).json();assert.equal(values.size,1);
 assert.equal((await send(spoof,'retire/'+prepared.token)).status,409);assert.equal(values.size,1);
 assert.equal((await send(b,'open',{runtimeId:b.id})).status,409);assert.equal(service.snapshot().client,a.id);
 check('Status discloses no owner capability; second-tab close retire and open cannot mutate the owner');
 time=1000;assert.equal((await send(a,'heartbeat',{sequence:2})).status,200);time=2000;
 const before=service.snapshot().session.remainingMs;assert.equal((await send(a,'heartbeat',{sequence:1})).status,409);assert.equal(service.snapshot().session.remainingMs,before);
 check('Reordered renewal does not extend the accepted deadline');
 time=31000;const expired=await(await fetch(base+'/api/preparation/status')).json();assert.equal(expired.session.state,'available');assert.equal(values.size,0);
 assert.ok(service.events.some(e=>e.type==='client-expired'&&e.id===a.id));assert.ok(!service.events.some(e=>e.type==='client-closed'&&e.id===a.id));
 check('Exact deadline retires silent ownership before the periodic sweep');
 assert.equal((await send(b,'open',{runtimeId:b.id})).status,200);
 const current=await(await send(b,'prepare',q(b,1))).json();assert.equal(values.size,1);
 assert.equal((await send(a,'retire/'+current.token)).status,410);assert.equal((await send(a,'cancel',q(a,1).identity)).status,200);
 assert.equal((await send(a,'close',{runtimeId:a.id})).status,200);assert.equal(values.size,1);assert.equal(service.snapshot().client,b.id);
 check('Old-session cleanup cannot retire or close replacement resources');
 const lateGate=deferred();hold=lateGate;entered=deferred();const late=send(b,'prepare',q(b,2));await entered.promise;
 time=61000;const pending=await(await fetch(base+'/api/preparation/status')).json();assert.equal(pending.cleanup,'pending-owned-work');assert.equal(pending.session.state,'available');
 assert.equal((await send(c,'open',{runtimeId:c.id})).status,200);lateGate.resolve();assert.equal((await late).status,410);assert.equal(values.size,0);
 assert.equal(service.snapshot().client,c.id);await send(c,'prepare',q(c,1));assert.equal(values.size,1);
 check('Known cancelled in-flight work may drain but its late result cannot revive the old client');
 await send(c,'close',{runtimeId:c.id});assert.equal(values.size,0);report.firstServer=await service.close();service=null;
 const failedRoot=path.join(root,'failed-retirement');await fs.mkdir(failedRoot);time=0;
 service=await createApplicationServer({runRoot:failedRoot,port:5199,bundle:root,certificatePath:path.join(root,'certificate.json'),now:()=>time,adapterFactory:async()=>{factoryCalls++;return adapter;}});
 await send(a,'open',{runtimeId:a.id});await send(a,'prepare',q(a,1));fault=true;time=30000;
 assert.equal((await send(b,'open',{runtimeId:b.id})).status,503);assert.equal(service.snapshot().session.state,'cleanup-failed');assert.equal(values.size,1);
 check('Failed retirement stays sticky and blocks replacement admission');
 assert.equal(service.snapshot().startupPid,undefined);assert.equal(factoryCalls,2);check('All controls use the injected fake adapter; no native controller starts');
 report.pass=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{
 if(service)report.lastServer=await service.close();
 report.cleanup=report.firstServer?.cleanup===true&&report.lastServer?.cleanup===true&&values.size===0;
 report.factoryCalls=factoryCalls;report.retiredTokens=retired.length;report.cancelledRequests=cancelled.length;report.ended=Date.now();
 await fs.writeFile(path.join(root,'http-session.json'),JSON.stringify(report,null,2)+'\n');
 await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/preparation-session-http-report.json',JSON.stringify(report.pass&&report.cleanup?report.checks.map(name=>({name})):[{name:'FAIL',error:report.error??'cleanup unconfirmed'}],null,2)+'\n');
 console.log(JSON.stringify({root,pass:report.pass,cleanup:report.cleanup,checks:report.checks,error:report.error}));
}
