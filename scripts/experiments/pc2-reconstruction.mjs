import { GENERATION_ROOT } from '../generation/config.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createPreparationRequest, worldReference, representationKey } from '../../src/space/preparation/contract.js';
import { createNativeAdapter } from '../preparation/native-adapter.mjs';

if(!process.env.ATLAS_GPU_HANDOFF||process.env.ATLAS_GPU_DEFERRED)throw Error('Hardware handoff required');
const root=path.resolve(process.argv[2]);if(!root.startsWith('/mnt/ml_storage/scratch/atlas-pc2/'))throw Error('Scratch required');await fs.mkdir(root);
const report={started:Date.now(),rows:[],events:[],cleanup:false,ownedPids:[process.pid]};let adapter;
try{
 adapter=await createNativeAdapter({runRoot:root,onEvent:e=>report.events.push(e)});report.ownedPids.push(adapter.snapshot().pid);report.hello=adapter.hello();
 const original=JSON.parse(await fs.readFile(path.join(GENERATION_ROOT,'provenance/legacy-buffer-controls.json'),'utf8'));const D=adapter.grid.config.diameter;
 let sequence=0;const currentKeys=new Map();
 const request=async(kind,retire=true)=>{
  const body=kind==='fine'?D/4:D,q=createPreparationRequest({schema:'atlas.preparation.request',schemaVersion:1,identity:{runtimeId:'pc2-reconstruction',epoch:0,requestId:'r'+ ++sequence},producer:adapter.producer(),world:worldReference(adapter.world),bounds:kind==='fine'?adapter.fineBounds:adapter.grid.bounds([0,0,0]),intent:'interaction',requirements:{maxErrorM:.01*body,bodyDiameterM:body}});
  const output=await adapter.prepare(q,{qualification:true});assert.equal(output.result.status,'prepared');const artifact=output.result.artifact;
  const control=original.rows.find(r=>r.label===(kind==='fine'?'fine-control':'home'));const key=representationKey(artifact);if(currentKeys.has(kind))assert.equal(key,currentKeys.get(kind));else currentKeys.set(kind,key);assert.deepEqual(artifact.buffers,control.buffers);
  const row={kind,cacheHit:output.cacheHit,key:representationKey(artifact),token:output.token,producer:q.producer,buffers:artifact.buffers};report.rows.push(row);if(retire)adapter.retire(output.token);return row;
 };
 // The preflight built home before fine; this fresh producer reverses that order.
 await request('fine');const first=await request('home',false),reuse=await request('home',false);assert.equal(reuse.cacheHit,true);
 adapter.retire(first.token);adapter.retire(reuse.token);const rebuilt=await request('home');assert.equal(rebuilt.cacheHit,false);
 const before=adapter.producer();await adapter.reset();assert.equal(adapter.producer().epoch,before.epoch+1);
 const stale=createPreparationRequest({schema:'atlas.preparation.request',schemaVersion:1,identity:{runtimeId:'stale',epoch:0,requestId:'stale'},producer:before,world:worldReference(adapter.world),bounds:adapter.grid.bounds([0,0,0]),intent:'interaction',requirements:{maxErrorM:.01*D,bodyDiameterM:D}});
 await assert.rejects(adapter.prepare(stale),/stale producer/);await request('home');report.pass=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{if(adapter){report.nativeCleanup=await adapter.close();report.cleanup=report.nativeCleanup.cleanup;}report.ended=Date.now();await fs.writeFile(path.join(root,'reconstruction.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,cleanup:report.cleanup,error:report.error,root}));}
