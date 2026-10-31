import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson } from '../../src/shared/scene.js';
import { sourceCase } from '../support/source-recipes.mjs';
import { createParentDefinition, sourceRecipeKey } from '../../src/space/generation/source-recipe.js';
import { createParentMesh, PARENT_TOLERANCE_M, PARENT_LIGHT } from '../../src/space/generation/parent-mesh.js';
import { readParentNpy, readSourceBundle, sourceDigest } from '../../scripts/generation/source-bundle.mjs';
import { createSourceAdapter } from '../../scripts/preparation/source-adapter.mjs';
import { createPreparedPoseModel } from '../../src/space/preparation/pose.js';
import { createPreparationRequest, worldReference, containsBounds, representationKey } from '../../src/space/preparation/contract.js';
import { createPreparedScene, decodeSceneFile, encodeSceneFile } from '../../src/space/preparation/scene-adapter.js';

function npy(heights,n) {
 const text=`{'descr': '<f8', 'fortran_order': False, 'shape': (${n}, ${n}), }`, head=Buffer.from(text+' '.repeat((64-(10+text.length+1)%64)%64)+'\n'), bytes=Buffer.alloc(10+head.length+heights.length*8);
 Buffer.from([147,78,85,77,80,89,1,0]).copy(bytes);bytes.writeUInt16LE(head.length,8);head.copy(bytes,10);heights.forEach((x,i)=>bytes.writeDoubleLE(x,10+head.length+i*8));return bytes;
}
async function fixture(t) {
 const root=await fs.mkdtemp('/mnt/ml_storage/scratch/atlas-md2a22-unit-'),adapters=[];t.after(async()=>{for(const a of adapters)await a.close();await fs.rm(root,{recursive:true,force:true});});
 const recipe=sourceCase(),heights=Array.from({length:65*65},(_,i)=>80+Math.floor(i/65)*.002+(i%65)*.001), bytes=npy(heights,65);
 const logical=readParentNpy(bytes,65).logicalSha256,definition=await createParentDefinition(recipe,logical),requestKey=await sourceRecipeKey(recipe);
 const files={'recipe.json':Buffer.from(canonicalJson(recipe)),'result.json':Buffer.from(canonicalJson({status:'resolved',requestKey,definition})),'height.npy':bytes};
 async function save() {
  for(const[name,data]of Object.entries(files))await fs.writeFile(path.join(root,name),data);
  await fs.writeFile(path.join(root,'bundle.json'),canonicalJson({schema:'atlas.generation.source-bundle',schemaVersion:1,files:Object.fromEntries(Object.entries(files).map(([name,data])=>[name,sourceDigest(data)]))}));
 }
 await save();return{root,recipe,heights,files,definition,save,own:a=>adapters.push(a)};
}

test('parent numeric reader refuses object dtype nonfinite negative zero truncated and trailing payloads',()=>{
 const bytes=npy([1,2,3,4],2);assert.deepEqual(Array.from(readParentNpy(bytes,2).heights),[1,2,3,4]);
 for(const bad of [bytes.subarray(0,-1),Buffer.concat([bytes,Buffer.from([0])]),npy([NaN,2,3,4],2),npy([-0,2,3,4],2),Buffer.from(bytes.toString('latin1').replace('<f8','|O8'),'latin1')])assert.throws(()=>readParentNpy(bad,2));
 assert.throws(()=>readParentNpy(bytes,3));const badVersion=Buffer.from(bytes);badVersion[6]=2;assert.throws(()=>readParentNpy(badVersion,2));
});

test('source bundle checks transport and complete mathematical identity even after a transport rehash',async t=>{
 const f=await fixture(t),first=await readSourceBundle(f.root);assert.deepEqual(first.definition,f.definition);
 const moved=f.root+'-moved';t.after(()=>fs.rm(moved,{recursive:true,force:true}));await fs.cp(f.root,moved,{recursive:true});assert.equal((await readSourceBundle(moved)).inputKey,first.inputKey);
 f.files['height.npy'][f.files['height.npy'].length-1]^=1;await fs.writeFile(path.join(f.root,'height.npy'),f.files['height.npy']);await assert.rejects(readSourceBundle(f.root),/transport/);
 await f.save();await assert.rejects(readSourceBundle(f.root),/definition/);
 const result=JSON.parse(f.files['result.json']);result.status='unresolved';f.files['result.json']=Buffer.from(canonicalJson(result));await f.save();await assert.rejects(readSourceBundle(f.root),/Unresolved/);
});

test('source bundle refuses unsafe manifest files and a height symlink outside the bundle',async t=>{
 const f=await fixture(t);const manifest=JSON.parse(await fs.readFile(path.join(f.root,'bundle.json')));manifest.files['../outside']=manifest.files['height.npy'];await fs.writeFile(path.join(f.root,'bundle.json'),JSON.stringify(manifest));await assert.rejects(readSourceBundle(f.root),/files/);
 await f.save();const outside=f.root+'-outside.npy';t.after(()=>fs.rm(outside,{force:true}));await fs.writeFile(outside,f.files['height.npy']);await fs.rm(path.join(f.root,'height.npy'));await fs.symlink(outside,path.join(f.root,'height.npy'));await assert.rejects(readSourceBundle(f.root),/escapes/);
});

test('parent mesh is upward closed and reconstructs identical physical terrain at both body sizes',async t=>{
 const f=await fixture(t),mesh=createParentMesh(f.definition,new Float64Array(f.heights)),r=mesh.representations.coarse,edges=new Map();
 assert.equal(r.vertices.length/3,8450);assert.equal(r.indices.length/3,8192);assert.equal(r.solid.length/3,16896);
 for(let i=0;i<r.solid.length;i+=3)for(const[a,b]of [[r.solid[i],r.solid[i+1]],[r.solid[i+1],r.solid[i+2]],[r.solid[i+2],r.solid[i]]]){const key=Math.min(a,b)+','+Math.max(a,b),row=edges.get(key)??[0,0];row[0]++;row[1]+=a<b?1:-1;edges.set(key,row);}
 assert.ok([...edges.values()].every(([count,balance])=>count===2&&balance===0));assert.ok(r.volumeM3>0);
 const[a,b,c]=Array.from(r.indices.subarray(0,3),id=>r.vertices.subarray(id*3,id*3+3));assert.ok((b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])>0);
 for(const other of Object.values(mesh.representations)){assert.ok(other.maxSurfaceErrorM<=PARENT_TOLERANCE_M);assert.ok(other.auditSlackM>0);assert.deepEqual(other.indices,r.indices);for(let i=0;i<r.vertices.length;i++)assert.equal(other.vertices[i]*other.scale,r.vertices[i]*r.scale);}
 const bad=new Float64Array(f.heights);bad[32*65+32]+=.1;assert.throws(()=>createParentMesh(f.definition,bad),/error budget/);
});

test('parent coverage enumerates every possible predicted address and bounds the admitted pose envelope',async t=>{
 const f=await fixture(t),adapter=await createSourceAdapter({bundle:f.root,runRoot:f.root});f.own(adapter);
 const hello=adapter.hello(),model=createPreparedPoseModel({world:adapter.world,grid:adapter.grid,fineBounds:adapter.fineBounds});
 for(const grid of [adapter.grid,adapter.viewGrid]){const domain=grid.config.domain;for(let i=domain[0][0];i<=domain[0][1];i++)for(let j=domain[1][0];j<=domain[1][1];j++)for(let k=domain[2][0];k<=domain[2][1];k++)assert.ok(containsBounds(adapter.fineBounds,grid.bounds([i,j,k])));}
 const envelope={min:model.localBounds.min.map((x,i)=>x+model.originM[i]),max:model.localBounds.max.map((x,i)=>x+model.originM[i])};assert.ok(containsBounds(adapter.fineBounds,envelope));assert.ok(model.supportsPositionM(hello.approach.entry,.1));
 const top=[...hello.approach.entry];top[1]=envelope.max[1]-.0001;assert.ok(model.supportsPositionM(top,.025));top[1]+=.001;assert.equal(model.supportsPositionM(top,.025),false);
});

test('source preparation requires source input and buffer qualification and owns publication epochs and cancellation',async t=>{
 const f=await fixture(t),adapter=await createSourceAdapter({bundle:f.root,runRoot:f.root});f.own(adapter);let sequence=0;
 const q=(patch={})=>createPreparationRequest({schema:'atlas.preparation.request',schemaVersion:1,identity:{runtimeId:'source-unit',epoch:0,requestId:String(++sequence)},producer:adapter.producer(),world:worldReference(adapter.world),bounds:adapter.grid.bounds([0,0,0]),intent:'interaction',requirements:{bodyDiameterM:.1,maxErrorM:.001},...patch});
 await assert.rejects(adapter.prepare(q()),/not qualified/);assert.throws(()=>adapter.installCertificate({sourcesKey:'legacy'}),/certificate/);
 const h=adapter.hello(),certificate={schema:'atlas.source-world.certificates',schemaVersion:1,sourcesKey:h.sourcesKey,evidenceId:'unit-only',worlds:[{definitionKey:f.definition.definitionKey,inputKey:h.inputKey,specimens:h.specimens}]};
 assert.throws(()=>adapter.installCertificate({...certificate,sourcesKey:'wrong'}),/mismatch/);adapter.installCertificate(certificate);
 const one=await adapter.prepare(q()),two=await adapter.prepare(q());assert.equal(representationKey(one.result.artifact),representationKey(two.result.artifact));
 const vertices=await adapter.buffer(one.token,'vertices');assert.equal(sourceDigest(vertices),one.result.artifact.buffers.find(x=>x.role==='vertices').sha256);vertices[0]^=1;assert.notEqual(sourceDigest(vertices),sourceDigest(await adapter.buffer(one.token,'vertices')));
 adapter.retire(one.token);await assert.rejects(adapter.buffer(one.token,'vertices'),/Retired/);adapter.retire(two.token);
 const cancelled=q();adapter.cancelRequest(cancelled.identity);await assert.rejects(adapter.prepare(cancelled),{name:'AbortError'});
 for(const patch of [{world:{id:'other',definitionKey:'other'}},{requirements:{bodyDiameterM:.05,maxErrorM:.001}},{requirements:{bodyDiameterM:.1,maxErrorM:1e-9}},{bounds:{min:[-2,-2,-2],max:[2,2,2]}}])assert.equal((await adapter.prepare(q(patch))).result.status,'unsupported');
 const stale=q();await adapter.reset();await assert.rejects(adapter.prepare(stale),/stale/);assert.equal(adapter.snapshot().publications,0);
 const pose=createPreparedPoseModel({world:adapter.world,grid:adapter.grid,fineBounds:adapter.fineBounds}).create(),scene=createPreparedScene({world:adapter.world,pose,lightDirection:PARENT_LIGHT});
 assert.equal(scene.sampling.profile,'source-parent-bilinear-r1');assert.equal(scene.tracing.coverageProfile,'source-parent-global-r1');assert.deepEqual(decodeSceneFile(encodeSceneFile(scene)),scene);
 const wrong=structuredClone(scene);wrong.sampling.profile='retained-native-r1';assert.throws(()=>decodeSceneFile(JSON.stringify(wrong)),/sampling/);
 assert.equal((await adapter.close()).cleanup,true);assert.equal(adapter.snapshot().totalOutputBytes,0);await assert.rejects(adapter.prepare(q()),/closed/);
});
