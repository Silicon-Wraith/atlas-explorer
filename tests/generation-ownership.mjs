// MD2.A1 native GPU migration control; all new world computation is project-owned.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createNativeAdapter} from '../scripts/preparation/native-adapter.mjs';
import {GENERATION_ROOT,GENERATION_BUNDLE} from '../scripts/generation/config.mjs';
import {createPreparationRequest,worldReference,representationKey} from '../src/space/preparation/contract.js';
import {preparedRunRoot} from './support/prepared-run-root.mjs';
import {installSuiteDeadline} from './support/bounded.mjs';
if(!process.env.ATLAS_GPU_HANDOFF||process.env.ATLAS_GPU_DEFERRED)throw Error('Native ownership acceptance requires one exclusive GPU handoff');
installSuiteDeadline('generation-ownership',300000);
const root=preparedRunRoot(process.env.ATLAS_GENERATION_RUN_ROOT??'/mnt/ml_storage/scratch/atlas-md2a/generation-'+new Date().toISOString().replace(/[:.]/g,'-'),'generation');await fs.mkdir(root);
const report=[],detail={started:Date.now(),rows:[],checks:[],events:[],cleanup:false,ownedPids:[process.pid]},exec=promisify(execFile);
const pass=name=>{report.push({name});detail.checks.push(name);console.log('PASS '+name);};
let adapter,controller,sequence=0;
const gold=JSON.parse(await fs.readFile(path.join(GENERATION_ROOT,'provenance/legacy-buffer-controls.json'),'utf8'));
async function request(label,{retire=true,rebuild=true}={}){
 const c=gold.rows.find(row=>row.label===label),q=createPreparationRequest({schema:'atlas.preparation.request',schemaVersion:1,identity:{runtimeId:'md2a1-migration',epoch:0,requestId:'r'+ ++sequence},producer:adapter.producer(),world:worldReference(adapter.world),bounds:c.bounds,intent:c.intent,requirements:c.requirements});
 const result=await adapter.prepare(q,{qualification:true,rebuild});assert.equal(result.result.status,'prepared',result.result.reason);
 const a=result.result.artifact;assert.equal(a.classification,c.classification);assert.deepEqual(a.buffers,c.buffers,'Delivered geometry differs from preserved '+label);
 for(const descriptor of a.buffers){const bytes=await adapter.buffer(result.token,descriptor.role);assert.equal(createHash('sha256').update(bytes).digest('hex'),descriptor.sha256);}
 const row={label,request:q,key:representationKey(a),cacheHit:result.cacheHit,buffers:a.buffers,native:result.native};detail.rows.push(row);if(retire)adapter.retire(result.token);return{...row,token:result.token};
}
try{
 adapter=await createNativeAdapter({runRoot:root,onController:value=>{controller=value;detail.ownedPids.push(value.pid);},onEvent:e=>detail.events.push(e)});detail.ownedPids.push(adapter.snapshot().pid);detail.hello=adapter.hello();assert.deepEqual(adapter.world,gold.world);
 assert.match(detail.hello.device.name,/NVIDIA|RTX/);pass('Owned generation uses the recorded native CUDA hardware and frozen legacy world');
 const own=detail.hello.ownership;assert.equal(own.graphsDistinct,true);assert.equal(own.sharedInteractionCaches,true);assert.equal(own.viewCachesDisabled,true);
 for(const m of own.modules)assert.ok(m.file.startsWith(path.join(GENERATION_ROOT,'native')+path.sep),m.file);
 for(const f of own.inputs)assert.ok(f.startsWith(GENERATION_BUNDLE+path.sep),f);
 for(const row of detail.hello.sourceFiles)if(!row.role.startsWith('external-package/'))assert.ok(row.file.startsWith(GENERATION_ROOT+path.sep)||row.file===path.resolve('scripts/preparation/native-worker.py'),row.file);
 pass('Actual first-party modules and registered inputs are repository-owned with distinct mesh modules');
 assert.throws(()=>adapter.installCertificate({sourcesKey:'legacy-or-wrong'}),/certificate source mismatch/);pass('Legacy or mismatched source certificates remain rejected');
 for(const label of ['home','new-3d','domain-corner','fine-control','view'])await request(label);
 pass('Fresh home new3D corner fine and view buffers exactly match preserved same-host controls');
 await adapter.reset();await request('fine-control');const first=await request('home',{retire:false,rebuild:false}),reuse=await request('home',{retire:false,rebuild:false});assert.equal(reuse.cacheHit,true);assert.equal(first.key,reuse.key);adapter.retire(first.token);adapter.retire(reuse.token);
 const rebuilt=await request('home');assert.equal(rebuilt.cacheHit,false);assert.equal(rebuilt.key,first.key);
 pass('Opposite order resident reuse and actual rebuild preserve current representation and geometry');
 const oldProducer=adapter.producer();await adapter.reset();const c=gold.rows[0],stale=createPreparationRequest({schema:'atlas.preparation.request',schemaVersion:1,identity:{runtimeId:'md2a1-stale',epoch:0,requestId:'stale'},producer:oldProducer,world:worldReference(adapter.world),bounds:c.bounds,intent:c.intent,requirements:c.requirements});await assert.rejects(adapter.prepare(stale),/stale producer/);assert.equal(adapter.snapshot().publications,0);
 pass('Stale producer epochs are rejected and all migration publications retire');
 detail.nativeCleanup=await adapter.close();adapter=null;detail.cleanup=detail.nativeCleanup.cleanup;assert.equal(detail.cleanup,true);await fs.writeFile(path.join(root,'migration.json'),JSON.stringify(detail,null,2)+'\n');
 const options={cwd:process.cwd(),timeout:120000,maxBuffer:4*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}};
 await exec(process.execPath,['scripts/experiments/pc2-qualification-input.mjs',root,'migration.json'],options);await exec(process.env.ATLAS_GENERATION_PYTHON??'/mnt/ml_storage/scratch/venvs/gpu/bin/python',['scripts/experiments/pc2-qualify.py',root],options);
 const q=JSON.parse(await fs.readFile(path.join(root,'qualification.json'),'utf8')),certificate=JSON.parse(await fs.readFile(path.join(root,'policy-certificate.json'),'utf8'));assert.equal(q.pass,true);assert.deepEqual(Object.keys(certificate.policies).sort(),['coarse','fine','view']);
 pass('Relocated mathematical references qualify all actual coarse fine and view source policies');
 pass('Native ownership control confirms process cleanup and preserves source-qualified evidence');detail.pass=true;
}catch(error){detail.failure=error.stack??String(error);report.push({name:'FAIL',error:detail.failure});process.exitCode=1;console.error(detail.failure);}
finally{
 if(adapter||controller&&!detail.nativeCleanup)try{detail.nativeCleanup=await(adapter?adapter.close():controller.close());detail.cleanup=detail.nativeCleanup.cleanup;}catch(error){detail.cleanupError=error.stack;process.exitCode=125;}
 detail.ended=Date.now();await fs.writeFile(path.join(root,'migration.json'),JSON.stringify(detail,null,2)+'\n');await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/generation-ownership-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({root,pass:detail.pass,cleanup:detail.cleanup,failure:detail.failure}));
}
