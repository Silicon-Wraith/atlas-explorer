// One bounded CPU-only preparation qualification; source generation is reused A2.1 evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { runBounded } from '../gate/supervise.mjs';
import { createSourceAdapter } from '../preparation/source-adapter.mjs';
import { createPreparationRequest, worldReference, containsBounds } from '../../src/space/preparation/contract.js';
import { createPreparedPoseModel } from '../../src/space/preparation/pose.js';
import { sourceDigest } from '../generation/source-bundle.mjs';
import { preparedRunRoot } from '../../tests/support/prepared-run-root.mjs';
const root=preparedRunRoot(process.argv[2]??'','source'),python=process.env.ATLAS_REFERENCE_PYTHON;
if(!python)throw Error('Explicit CPU NumPy interpreter required');
await fs.mkdir(root);const deadline=Date.now()+180000,report={started:Date.now(),pass:false,ownedPids:[process.pid],cases:[]};let adapter;
const save=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');
try {
 let sourcesKey;
 for(const name of ['A','B']) {
  const dir=path.join(root,name);await fs.mkdir(dir);const original=process.env['ATLAS_PARENT_'+name]??'/mnt/ml_storage/scratch/atlas-md2a2/native-r1/'+name+'/bundle';
  await fs.cp(original,path.join(dir,'input'),{recursive:true});
  adapter=await createSourceAdapter({bundle:path.join(dir,'input'),runRoot:dir});const hello=adapter.hello();sourcesKey??=hello.sourcesKey;assert.equal(hello.sourcesKey,sourcesKey);
  const rows=[],model=createPreparedPoseModel({world:adapter.world,grid:adapter.grid,fineBounds:adapter.fineBounds});let count=0;
  for(const grid of [adapter.grid,adapter.viewGrid]) {
   const d=grid.config.domain;
   for(let i=d[0][0];i<=d[0][1];i++)for(let j=d[1][0];j<=d[1][1];j++)for(let k=d[2][0];k<=d[2][1];k++){assert.ok(containsBounds(adapter.fineBounds,grid.bounds([i,j,k])));count++;}
  }
  assert.ok(containsBounds(adapter.fineBounds,{min:model.localBounds.min.map((x,i)=>x+model.originM[i]),max:model.localBounds.max.map((x,i)=>x+model.originM[i])}));
  for(const [kind,intent,body]of [['coarse','interaction',.1],['fine','interaction',.025],['view','view',null]]) {
   const q=createPreparationRequest({schema:'atlas.preparation.request',schemaVersion:1,identity:{runtimeId:'source-preflight-'+name,epoch:0,requestId:kind},producer:adapter.producer(),world:worldReference(adapter.world),bounds:kind==='fine'?adapter.fineBounds:(kind==='view'?adapter.viewGrid:adapter.grid).bounds([0,0,0]),intent,requirements:{bodyDiameterM:body,maxErrorM:.01*(body??.4)}});
   const output=await adapter.prepare(q,{qualification:true});assert.equal(output.result.status,'prepared');const artifact=output.result.artifact;
   for(const b of artifact.buffers)await fs.writeFile(path.join(dir,kind+'-'+b.role+'.bin'),await adapter.buffer(output.token,b.role));
   rows.push({kind,artifact});adapter.retire(output.token);
  }
  await save(path.join(dir,'specimen.json'),{hello,rows,addressesChecked:count,poseEnvelope:model.localBounds});
  report.cases.push({name,hello,rows,addressesChecked:count,cleanup:await adapter.close()});adapter=null;
 }
 const remaining=deadline-Date.now();assert.ok(remaining>0);
 const checker=await runBounded({spawnFn:(...args)=>{const child=spawn(...args);report.ownedPids.push(child.pid);return child;},command:python,args:['scripts/experiments/md2a22-qualify.py',root],timeoutMs:remaining,
  options:{cwd:process.cwd(),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONPATH:'',PYTHONHOME:''}}});
 report.checker=checker;assert.notEqual(checker.cleanup,'unconfirmed');assert.equal(checker.timedOut,false);assert.equal(checker.exitCode,0,checker.stderr||checker.stdout);
 const qualification=JSON.parse(await fs.readFile(path.join(root,'qualification.json')));assert.equal(qualification.pass_,true);assert.equal(qualification.cudaImported,false);
 const certificate={schema:'atlas.source-world.certificates',schemaVersion:1,sourcesKey,evidenceId:'sha256:'+sourceDigest(await fs.readFile(path.join(root,'qualification.json'))),
  worlds:report.cases.map(row=>({definitionKey:row.hello.definition.parameters.parent.definitionKey,inputKey:row.hello.inputKey,specimens:row.hello.specimens}))};
 await save(path.join(root,'source-world-certificates.json'),certificate);
 report.independentSources={};for(const file of ['scripts/experiments/md2a22-qualify.py','scripts/generation/create-parent.py','scripts/generation/source_recipe.py','scripts/generation/native/check_collision_r0.py'])report.independentSources[file]=sourceDigest(await fs.readFile(file));
 report.pass=true;
} catch(error){report.failure=error.stack;console.error(report.failure);process.exitCode=1;}
finally {if(adapter)try{report.extraCleanup=await adapter.close();}catch(e){report.cleanupFailure=e.message;process.exitCode=125;}report.ended=Date.now();await save(path.join(root,'preflight.json'),report);console.log(JSON.stringify({root,pass:report.pass,failure:report.failure,elapsedMs:report.ended-report.started}));}
