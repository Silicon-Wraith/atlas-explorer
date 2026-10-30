import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApplicationServer } from '../preparation/application-server.mjs';
import { createPreparationRequest, worldReference } from '../../src/space/preparation/contract.js';

if(!process.env.ATLAS_GPU_HANDOFF||process.env.ATLAS_GPU_DEFERRED)throw Error('Explicit hardware handoff required');
const root=path.resolve(process.argv[2]);if(!root.startsWith('/mnt/ml_storage/scratch/atlas-pc3/'))throw Error('PC3 scratch root required');await fs.mkdir(root);
let service;const report={started:Date.now(),handoff:process.env.ATLAS_GPU_HANDOFF,cleanup:false,checks:{},ownedPids:[process.pid]};
try{
 service=await createApplicationServer({runRoot:root});const base='http://127.0.0.1:'+service.port,headers={'Content-Type':'application/json',Origin:base,'X-Atlas-Client':'pc3-http-smoke','X-Atlas-Session':'http-smoke-session-nonce'};
 const send=(endpoint,body,extra={})=>fetch(base+'/api/preparation/'+endpoint,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 assert.match(await (await fetch(base+'/')).text(),/id="space-workspace"/);report.checks.actualApplication=true;
 assert.equal((await fetch(base+'/tests/fixtures/pc2/index.html')).status,403);report.checks.privatePathsBlocked=true;
 assert.equal((await fetch(base+'/src/preparation-worker.js')).status,200);report.checks.productWorkerServed=true;
 assert.equal((await send('open',{runtimeId:'foreign-client'},{Origin:'https://example.com'})).status,403);assert.equal(service.snapshot().startupPid,undefined);report.checks.foreignOriginCannotInitialize=true;
 await send('close',{runtimeId:'closed-before-open'},{'X-Atlas-Client':'closed-before-open'});assert.equal((await send('open',{runtimeId:'closed-before-open'},{'X-Atlas-Client':'closed-before-open'})).status,410);assert.equal(service.snapshot().startupPid,undefined);report.checks.cancelBeforeOpen=true;
 const opened=await send('open',{runtimeId:'pc3-http-smoke'});assert.equal(opened.status,200);const hello=report.hello=await opened.json();report.ownedPids.push(service.snapshot().startupPid);
 const D=hello.grid.diameter,q=createPreparationRequest({schema:'atlas.preparation.request',schemaVersion:1,identity:{runtimeId:'pc3-http-smoke',epoch:0,requestId:'pc3-http-smoke:1'},producer:hello.producer,world:worldReference(hello.world),bounds:{min:hello.grid.origin.map(x=>x-D),max:hello.grid.origin.map(x=>x+D)},intent:'interaction',requirements:{maxErrorM:.01*D,bodyDiameterM:D}});
 const response=await send('prepare',q);assert.equal(response.status,200);const prepared=await response.json();assert.equal(prepared.result.status,'prepared');report.artifact=prepared.result.artifact;
 for(const descriptor of report.artifact.buffers){const r=await fetch(base+'/api/preparation/buffer/'+prepared.token+'/'+descriptor.role,{headers:{'X-Atlas-Client':'pc3-http-smoke'}});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.byteLength,descriptor.byteLength);assert.equal(createHash('sha256').update(bytes).digest('hex'),descriptor.sha256);}
 report.checks.livePreparedPayload=true;
 await send('close',{runtimeId:'pc3-http-smoke'});assert.equal(service.snapshot().native.publications,0);report.checks.explicitCloseRetires=true;report.pass=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{if(service){report.server=await service.close();report.cleanup=report.server.cleanup;}report.ended=Date.now();await fs.writeFile(path.join(root,'http-smoke.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({root,pass:report.pass,checks:report.checks,cleanup:report.cleanup,error:report.error}));}
