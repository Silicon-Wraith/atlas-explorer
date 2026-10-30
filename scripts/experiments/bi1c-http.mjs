// Real HTTP admission with fake native ownership. No child/browser/GPU process.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createApplicationServer} from '../preparation/application-server.mjs';
import {createPreparationRequest,worldReference} from '../../src/space/preparation/contract.js';
import {preparedFixture,deferred} from '../../tests/support/prepared-fixture.mjs';
import {preparedRunRoot} from '../../tests/support/prepared-run-root.mjs';
const root=preparedRunRoot(process.argv[2]??process.env.ATLAS_RECOVERY_HTTP_ROOT??'/mnt/ml_storage/scratch/atlas-bi1c/http-'+new Date().toISOString().replace(/[:.]/g,'-'),'recovery');await fs.mkdir(root);
const fixture=preparedFixture(),report={nativeFree:true,started:Date.now(),checks:[],cleanup:false,servers:[]};let service,factoryCalls=0,dead=false,hold=null,entered=null,heldGate=null,serial=0;
await fs.writeFile(path.join(root,'feature-r0.json'),JSON.stringify({world_point:[0,0,-1],light_direction:[1,0,0]}));await fs.writeFile(path.join(root,'certificate.json'),'{}');
const values=new Map(),retired=[];
const adapter={world:fixture.world,grid:fixture.grid,viewGrid:fixture.viewGrid,fineBounds:fixture.fineBounds,producer:()=>fixture.producerIdentity,installCertificate(){},hello:()=>({approach:{entry:[0,0,0],inspection_eye:[0,0,0],target:[0,0,-1],fine_origin:[0,0,0],d:.25}}),
 async prepare(q){if(hold){const gate=hold;hold=null;entered.resolve();await gate.promise;}const output=await fixture.produce(q);await output.payload.release();const token='fake-'+(++serial);values.set(token,q.identity);return{result:output.result,token};},
 async buffer(){return Buffer.alloc(0);},retire(token){if(values.delete(token))retired.push(token);},cancelRequest(id){for(const[token,identity]of values)if(identity.requestId===id.requestId)adapter.retire(token);},
 snapshot:()=>({queue:{active:0,queued:0},publications:values.size,failure:dead?{code:'preparer-lost'}:null}),async close(){values.clear();return{cleanup:true,fake:true};}};
const base='http://127.0.0.1:5199',a={id:'recovery-client-a',nonce:'recovery-session-a'},b={id:'recovery-client-b',nonce:'recovery-session-b'};
const headers=c=>({'Content-Type':'application/json',Origin:base,'X-Atlas-Client':c.id,'X-Atlas-Session':c.nonce});
const send=(c,end,body={})=>fetch(base+'/api/preparation/'+end,{method:'POST',headers:headers(c),body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
const q=n=>createPreparationRequest({schema:'atlas.preparation.request',schemaVersion:1,identity:{runtimeId:a.id,requestId:a.id+':'+n,epoch:0},producer:fixture.producerIdentity,world:worldReference(fixture.world),bounds:fixture.grid.bounds([0,0,0]),intent:'interaction',requirements:{bodyDiameterM:1,maxErrorM:.01}});
const pass=name=>report.checks.push(name);
async function start(dir,factory){await fs.mkdir(dir);service=await createApplicationServer({runRoot:dir,port:5199,bundle:root,certificatePath:path.join(root,'certificate.json'),adapterFactory:factory});}
async function finish(){if(!service)return;const receipt=await service.close();report.servers.push(receipt);assert.equal(service.snapshot().startupPid,undefined);service=null;assert.equal(receipt.cleanup,true);}
try{
 await start(path.join(root,'terminal'),async()=>{factoryCalls++;return adapter;});
 const before=await(await fetch(base+'/api/preparation/status')).json();assert.equal(factoryCalls,0);assert.equal(before.preparer,'not-started');pass('Recovery HTTP status is passive before startup');
 assert.equal((await send(a,'open',{runtimeId:a.id})).status,200);const first=await(await send(a,'prepare',q(1))).json();assert.equal(factoryCalls,1);assert.equal(values.size,1);pass('Client adapter is admitted once for healthy operations');
 heldGate=deferred();hold=heldGate;entered=deferred();const late=send(a,'prepare',q(2));await entered.promise;dead=true;
 for(const response of [await send(a,'prepare',q(3)),await send(a,'heartbeat',{sequence:1}),await send(b,'open',{runtimeId:b.id}),await fetch(base+'/api/preparation/buffer/'+first.token+'/vertices',{headers:headers(a)})]){assert.equal(response.status,503);assert.equal((await response.json()).code,'preparer-lost');}
 assert.equal((await(await fetch(base+'/api/preparation/status')).json()).preparer,'unavailable');assert.equal(factoryCalls,1);assert.equal(service.snapshot().client,a.id);pass('Native loss is typed for open prepare transfer and heartbeat');
 heldGate.resolve();const lateResponse=await late;assert.equal(lateResponse.status,503);assert.equal((await lateResponse.json()).code,'preparer-lost');assert.ok(retired.includes('fake-2'));assert.equal(values.size,1);pass('A held result after terminal loss is retired before publication');
 assert.equal((await send(a,'retire/'+first.token)).status,200);assert.equal((await send(a,'cancel',q(1).identity)).status,200);assert.equal((await send(a,'close',{runtimeId:a.id})).status,200);assert.equal(values.size,0);assert.equal((await send(b,'open',{runtimeId:b.id})).status,503);assert.equal(factoryCalls,1);pass('Loss cleanup remains available and never constructs a replacement');await finish();
 let startupCalls=0,startupCloses=0,closed;
 await start(path.join(root,'failed-startup'),async({onController})=>{startupCalls++;onController({close:()=>closed??=Promise.resolve().then(()=>{startupCloses++;return{cleanup:true,fake:true};})});throw Error('synthetic startup failure');});
 assert.equal((await send(a,'open',{runtimeId:a.id})).status,503);assert.equal(startupCloses,1);assert.equal((await send(b,'open',{runtimeId:b.id})).status,503);await fetch(base+'/api/preparation/status');assert.equal(startupCalls,1);pass('Failed startup confirms cleanup and remains restart-required');await finish();
 let certificateCloses=0;
 await start(path.join(root,'failed-certificate'),async()=>({...adapter,installCertificate(){throw Error('synthetic certificate mismatch');},async close(){certificateCloses++;return{cleanup:true,fake:true};}}));
 assert.equal((await send(a,'open',{runtimeId:a.id})).status,503);assert.equal(certificateCloses,1);pass('Post-construction certificate failure closes its owned adapter');await finish();
 let canConfirm=false,attempts=0;
 await start(path.join(root,'failed-cleanup'),async({onController})=>{attempts++;onController({async close(){if(!canConfirm)throw Error('synthetic missing cleanup acknowledgement');return{cleanup:true,fake:true};}});throw Error('synthetic startup failure');});
 const failed=await send(a,'open',{runtimeId:a.id});assert.equal(failed.status,503);assert.equal((await failed.json()).code,'cleanup-failed');canConfirm=true;
 assert.equal((await send(b,'open',{runtimeId:b.id})).status,503);assert.equal(attempts,1);pass('Startup cleanup failure stays sticky even after a later teardown acknowledgement');await finish();
 assert.equal(factoryCalls,1);assert.equal(values.size,0);pass('Recovery HTTP fixtures use no native process and confirm owned cleanup');report.pass=true;
}catch(error){report.error=error.stack??String(error);process.exitCode=1;}
finally{
 heldGate?.resolve();if(service)try{await finish();}catch(error){report.cleanupError=error.message;}
 report.cleanup=report.servers.length===4&&report.servers.every(s=>s.cleanup)&&!report.cleanupError&&values.size===0;report.factoryCalls=factoryCalls;report.ended=Date.now();
 await fs.writeFile(path.join(root,'recovery-http.json'),JSON.stringify(report,null,2)+'\n');await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/preparation-recovery-http-report.json',JSON.stringify(report.pass&&report.cleanup?report.checks.map(name=>({name})):[{name:'FAIL',error:report.error??report.cleanupError??'Cleanup failed'}],null,2)+'\n');console.log(JSON.stringify({root,pass:report.pass,cleanup:report.cleanup,checks:report.checks,error:report.error}));
}
