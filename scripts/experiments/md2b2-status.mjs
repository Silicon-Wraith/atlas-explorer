// Real CUDA/source-creator controls, called within the maintained exclusive GPU suite.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {runBounded} from '../gate/supervise.mjs';
export async function runGenerationStatusControls({root,onPid=()=>{}}){
 if(!process.env.ATLAS_GPU_HANDOFF||process.env.ATLAS_GPU_DEFERRED)throw Error('GPU handoff required');
 await fs.mkdir(root);const started=Date.now(),deadline=started+60000,detail={started,runs:[],cleanup:true};
 const gpu=process.env.ATLAS_GENERATION_PYTHON??'/mnt/ml_storage/scratch/venvs/gpu/bin/python',cpu=process.env.ATLAS_REFERENCE_PYTHON;
 assert.ok(cpu,'CPU NumPy/mpmath interpreter required');
 const file=path.resolve('tests/reference/generation-status-cases.json'),cases=JSON.parse(await fs.readFile(file,'utf8'));
 const dirs={};for(const name of ['tmp','cupy-cache','cuda-cache']){dirs[name]=path.join(root,name);await fs.mkdir(dirs[name]);}
 const env={...process.env,PYTHONDONTWRITEBYTECODE:'1',TMPDIR:dirs.tmp,CUPY_CACHE_DIR:dirs['cupy-cache'],CUDA_CACHE_PATH:dirs['cuda-cache'],OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};
 async function command(command,args,label){
  const remaining=deadline-Date.now();assert.ok(remaining>0,'Status block exhausted60s');
  const run=await runBounded({spawnFn:(...args)=>{const p=spawn(...args);if(p.pid)onPid(p.pid);return p;},command,args,timeoutMs:Math.max(1,remaining-2500),cleanupMs:1000,options:{cwd:process.cwd(),env}});
  detail.runs.push({label,args,...run});detail.cleanup&&=['confirmed','not-needed'].includes(run.cleanup);
  await fs.writeFile(path.join(root,label+'.stdout'),run.stdout);await fs.writeFile(path.join(root,label+'.stderr'),run.stderr);
  assert.ok(detail.cleanup,'Status child cleanup unconfirmed');assert.equal(run.timedOut,false,'Status block timed out');assert.equal(run.exitCode,0,run.stderr||run.stdout||run.spawnError);
 }
 try{
  await command(gpu,['-B','scripts/experiments/md2b2-gpu-status.py',root,file],'direct');
  const direct=JSON.parse(await fs.readFile(path.join(root,'direct.json')));assert.match(direct.device,/NVIDIA|RTX/);assert.deepEqual(direct.status,cases.direct.expectedStatuses);
  for(const c of cases.creator){const input=path.join(root,c.id+'.json');await fs.writeFile(input,JSON.stringify(c.recipe));await command(gpu,['-B','scripts/generation/create-parent.py',input,'--out',path.join(root,c.id)],c.id);}
  await command(cpu,['-B','scripts/experiments/md2b2-check-status.py',root,file],'reference');
  detail.reference=JSON.parse(await fs.readFile(path.join(root,'reference.json')));assert.equal(detail.reference.pass_,true);detail.pass=true;
 }catch(error){detail.error=error.stack;throw error;}
 finally{detail.elapsedMs=Date.now()-started;await fs.writeFile(path.join(root,'status-controls.json'),JSON.stringify(detail,null,2)+'\n');}
 return detail;
}
