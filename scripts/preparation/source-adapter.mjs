// Ready-to-use whole-parent geometry, owned by the local application helper.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { canonicalJson } from '../../src/shared/scene.js';
import { createWorldRecord, worldReference, createPreparationRequest, createPreparationResult, createPreparedArtifact, assertResultForRequest, containsBounds, representationKey } from '../../src/space/preparation/contract.js';
import { createParentMesh, PARENT_BODY_M, PARENT_TOLERANCE_M, PARENT_LIGHT } from '../../src/space/generation/parent-mesh.js';
import { readSourceBundle, sourceDigest } from '../generation/source-bundle.mjs';
import { createPublications } from './publications.mjs';
const project=fileURLToPath(new URL('../../',import.meta.url));
export const SOURCE_WORLD_CERTIFICATE=fileURLToPath(new URL('../generation/source-world-certificates.json',import.meta.url));
const sourceFiles=['scripts/generation/source-bundle.mjs','scripts/preparation/source-adapter.mjs','scripts/preparation/publications.mjs',
 'src/space/generation/parent-mesh.js','src/space/generation/source-recipe.js','src/shared/scene.js','src/space/preparation/contract.js','src/space/preparation/spatial-grid.js','src/space/preparation/scene-adapter.js'];
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
function bytesOf(array) {
 const bytes=Buffer.alloc(array.length*4), floats=array instanceof Float32Array;
 for(let i=0;i<array.length;i++)if(floats)bytes.writeFloatLE(array[i],i*4);else bytes.writeUInt32LE(array[i],i*4);
 return bytes;
}
export async function createSourceAdapter({bundle,runRoot,onEvent=()=>{}}) {
 ensure(path.resolve(runRoot).startsWith('/mnt/ml_storage/scratch/'),'Source preparation output requires scratch');
 const input=await readSourceBundle(bundle), mesh=createParentMesh(input.definition,input.heights);
 const sources=await Promise.all(sourceFiles.map(async role=>({role,sha256:sourceDigest(await fs.readFile(path.join(project,role)))})));
 const packages={node:process.versions.node}, sourcesKey=sourceDigest(canonicalJson({sources,packages}));
 const world=createWorldRecord({id:'parent@'+input.definition.definitionKey,generator:input.recipe.generator,parameters:{parent:input.definition},
  assets:[{role:'canonical-parent-logical-array',sha256:input.definition.surface.logicalSha256}],lineage:[{id:'parent',parent:null}]});
 let producer={instanceId:randomUUID(),epoch:0},closed=false,certificate=null,qualified=null,ownedBytes=0;
 const records=[],buffers=new Map(),publications=createPublications({onRetire:(p,token)=>onEvent({type:'producer-retired',time:Date.now(),token,identity:p.identity})});
 for(const r of Object.values(mesh.representations)) {
  r.buffers={vertices:bytesOf(r.vertices),'surface-indices':bytesOf(r.indices),...(r.kind==='view'?{}:{'solid-indices':bytesOf(r.solid)})};
  r.descriptors=Object.entries(r.buffers).map(([role,bytes])=>({role,byteLength:bytes.length,sha256:sourceDigest(bytes)}));
  for(const [role,bytes]of Object.entries(r.buffers)){buffers.set(r.kind+':'+role,bytes);ownedBytes+=bytes.length;}
 }
 const specimens=()=>Object.fromEntries(Object.entries(mesh.representations).map(([kind,r])=>[kind,{buffers:r.descriptors,maxSurfaceErrorM:r.maxSurfaceErrorM,auditSlackM:r.auditSlackM}]));
 const hello=()=>({type:'ready',mode:'source-parent',producer,definition:world,sources,packages,sourcesKey,inputKey:input.inputKey,transport:input.transport,
  grid:mesh.grid.config,viewGrid:mesh.viewGrid.config,approach:{entry:mesh.entry,inspection_eye:mesh.entry,target:mesh.target,fine_origin:mesh.entry,d:PARENT_BODY_M/4},
  feature:{world_point:mesh.target,light_direction:PARENT_LIGHT},specimens:specimens(),certificate});
 function artifact(r,qualification) {
  return createPreparedArtifact({schema:'atlas.preparation.artifact',schemaVersion:1,world:worldReference(world),bounds:mesh.bounds,
   transform:{originM:mesh.entry,metresPerUnit:r.scale},intent:r.kind==='view'?'view':'interaction',classification:'surface',
   classificationBasis:{kind:'constructed-approximation',method:'paired-closed-uniform-parent-grid',evidenceId:'sha256:'+sourceDigest(canonicalJson(r.descriptors)),volumeM3:r.volumeM3},
   qualification:{kind:'empirical',toleranceM:PARENT_TOLERANCE_M,referenceSamples:qualification?0:(mesh.cells+1)**2,meshSamples:qualification?0:mesh.cells**2,denseValidation:false,
    evidenceId:qualification?'MD2A22/preflight-only':certificate.evidenceId,
    limits:['Only the pinned A/B parent definitions and this source/Node policy are qualified.','Finite independent reconstruction plus analytical interpolation/roundoff evidence; not an exact-arithmetic collision guarantee.','Whole bounded world duplicated across resident consumer leases; no new mathematical detail on shrink.']},
   representation:{builder:{id:'atlas-parent-grid',version:'1',sourceDigests:sources},sampling:{method:'bilinear-grid-v1',cells:mesh.cells,stepM:mesh.step,tileWidthM:2*mesh.extent,maxSurfaceErrorM:r.maxSurfaceErrorM,coordinateType:'float32-local-metres-per-unit'},
    dependencies:[{role:'canonical-parent-logical-array',sha256:input.definition.surface.logicalSha256}],features:['parent']},buffers:r.descriptors});
 }
 function result(q,status,reason,a=null){return createPreparationResult({schema:'atlas.preparation.result',schemaVersion:1,identity:q.identity,producer,status,reason,artifact:a});}
 return Object.freeze({world,grid:mesh.grid,viewGrid:mesh.viewGrid,fineBounds:mesh.fineBounds,records,hello,producer:()=>({...producer}),
  installCertificate(value){
   ensure(!closed&&value?.schema==='atlas.source-world.certificates'&&value.schemaVersion===1&&value.sourcesKey===sourcesKey,'Source certificate/source mismatch');
   const row=value.worlds?.find(x=>x.definitionKey===input.definition.definitionKey&&x.inputKey===input.inputKey);
   ensure(row&&same(row.specimens,specimens())&&typeof value.evidenceId==='string'&&value.evidenceId.length>0,'Source world/policy is not qualified');certificate=value;qualified=row;
  },
  async prepare(value,{signal,qualification=false}={}){
   const q=createPreparationRequest(value);ensure(!closed&&same(q.producer,producer),'Source preparer closed or stale producer');
   if(signal?.aborted||publications.cancelled(q.identity))throw Object.assign(Error('Source request cancelled'),{name:'AbortError'});
   const kind=q.intent==='view'?'view':q.requirements.bodyDiameterM===PARENT_BODY_M?'coarse':q.requirements.bodyDiameterM===PARENT_BODY_M/4?'fine':null;
   if(!kind||!same(q.world,worldReference(world))||!containsBounds(mesh.bounds,q.bounds)||q.requirements.maxErrorM<PARENT_TOLERANCE_M)return{result:result(q,'unsupported','Unsupported source world, coverage, body or accuracy'),token:null};
   ensure(qualification||qualified,'Source world/policy is not qualified');
   if(publications.size()>=16)return{result:result(q,'unsupported','Source publication capacity'),token:null};
   const began=performance.now(),r=mesh.representations[kind],a=artifact(r,qualification),output=assertResultForRequest(result(q,'prepared',null,a),q),token=randomUUID();
   publications.publish(token,{identity:q.identity,kind,artifact:a});
   const record={type:'producer-prepared',time:Date.now(),identity:q.identity,kind,representationKey:representationKey(a),artifact:a,token,cacheHit:true,fieldCalls:0,fieldPoints:0,timings:{publicationMs:performance.now()-began}};
   records.push(record);onEvent(record);return{result:output,token,cacheHit:true,native:{fieldCalls:0,fieldPoints:0,timings:record.timings}};
  },
  async buffer(token,role){ensure(!closed,'Source preparer closed');const p=publications.get(token);ensure(p,'Retired source publication');ensure(p.artifact.buffers.some(b=>b.role===role),'Source buffer role unavailable');return Buffer.from(buffers.get(p.kind+':'+role));},
  retire:publications.retire,cancelRequest:publications.cancel,
  snapshot:()=>({queue:{active:0,queued:0,closed},publications:publications.size(),cacheEntries:buffers.size,totalOutputBytes:ownedBytes,pid:null,failure:null}),
  async reset(){ensure(!closed&&publications.size()===0,'Source reset requires retired idle state');publications.reset();producer={...producer,epoch:producer.epoch+1};return{...producer};},
  async close(){if(!closed){closed=true;publications.clear();buffers.clear();input.heights=null;for(const r of Object.values(mesh.representations)){r.vertices=null;r.indices=null;r.solid=null;r.buffers=null;}ownedBytes=0;await fs.writeFile(path.join(runRoot,'source-records.json'),JSON.stringify({records,sourcesKey,inputKey:input.inputKey,cleanup:true},null,2)+'\n');}return{cleanup:true,childProcess:false,publications:publications.size()};},
 });
}
