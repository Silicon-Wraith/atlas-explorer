import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runBounded} from '/mnt/ml_storage/dev/projects/mandelbrot_explorer/.worktrees/md2a2/scripts/gate/supervise.mjs';
import {createParentDefinition,sourceRecipeKey} from '/mnt/ml_storage/dev/projects/mandelbrot_explorer/.worktrees/md2a2/src/space/generation/source-recipe.js';
import {sourceCase} from '/mnt/ml_storage/dev/projects/mandelbrot_explorer/.worktrees/md2a2/tests/support/source-recipes.mjs';
const home='/mnt/ml_storage/scratch/atlas-md2a2';const data=path.join(home,'native-r1');const out=path.join(home,'cpu-completion-r0');
await fs.mkdir(out);const python='/home/john-sheppard/miniconda3_fresh/bin/python3';const deadline=Date.now()+120000;
const load=async p=>JSON.parse(await fs.readFile(p,'utf8'));const save=async(p,v)=>fs.writeFile(p,JSON.stringify(v,null,2)+'\n');
const hash=b=>createHash('sha256').update(b).digest('hex');const manifest=await load(path.join(home,'completion-input-manifest.json'));
const report={started:Date.now(),pass:false,ownedPids:[process.pid],processes:[],checks:[],referencePython:python,frozenManifest:manifest};
async function frozen(){for(const row of manifest)assert.equal(hash(await fs.readFile(row.path)),row.sha256,row.path);}
async function exec(args,success=true){
 const remaining=deadline-Date.now();assert.ok(remaining>0,'120s bound');
 const run=await runBounded({spawnFn:(...args)=>{const child=spawn(...args);if(child.pid)report.ownedPids.push(child.pid);return child;},command:python,args,
 options:{cwd:'/mnt/ml_storage/dev/projects/mandelbrot_explorer/.worktrees/md2a2',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}},timeoutMs:remaining});
 report.processes.push({args,...run});assert.notEqual(run.cleanup,'unconfirmed');assert.equal(run.timedOut,false);
 if(success)assert.equal(run.exitCode,0,run.stderr||run.stdout||run.spawnError);else assert.notEqual(run.exitCode,0);
 return run;
}
try{
 await frozen();report.checks.push('All frozen original input and mathematical checker/source hashes match before CPU completion');
 const original=await load(path.join(data,'experiment.json'));assert.equal(original.pass,false);assert.match(original.failure,/No module named 'mpmath'/);
 for(const name of ['A','B','A-rebuild','B-rebuild','unknown','deep']){
  const result=await load(path.join(data,name,'bundle/result.json'));const label=name.replace('-rebuild','');
  assert.equal(result.requestKey,await sourceRecipeKey(sourceCase(label)));
  if(['A','B'].includes(label))assert.deepEqual(result.definition,await createParentDefinition(sourceCase(label),result.definition.surface.logicalSha256));
  else{assert.equal(result.status,label==='deep'?'unsupported':'unresolved');assert.equal(result.definition,null);await assert.rejects(fs.access(path.join(data,name,'bundle/height.npy')));}
 }
 for(const name of ['A','B'])assert.equal(hash(await fs.readFile(path.join(data,name,'bundle/height.npy'))),hash(await fs.readFile(path.join(data,name+'-rebuild','bundle/height.npy'))));
 report.checks.push('All original recipe identities and positive repeatability/negative no-surface conditions independently rechecked');
 const probe=await exec(['-c',await fs.readFile(path.join(home,'reference-probe.txt'),'utf8')]);
 report.referenceEnvironment=JSON.parse(probe.stdout);assert.equal(report.referenceEnvironment.cudaImported,false);
 await exec(['scripts/generation/check-parent.py',path.join(data,'A'),path.join(data,'B'),path.join(out,'mathematics.json')]);
 report.mathematics=await load(path.join(out,'mathematics.json'));assert.equal(report.mathematics.pass_,true);assert.equal(report.mathematics.cudaImported,false);
 for(const name of ['A','B'])assert.equal(report.mathematics.cases[name].points.length,32);
 report.checks.push('Unchanged independent 50-digit checker passes all 64 selected points on the unchanged original grids');
 const moved=path.join(out,'relocated');await fs.cp(path.join(data,'A/bundle'),moved,{recursive:true});
 await exec(['scripts/generation/create-parent.py','--verify',moved]);report.checks.push('Relocated original complete bundle verifies on the installed CPU reference environment');
 for(const [name,file] of [['request','recipe.json'],['result','result.json'],['height','height.npy']]){
  const dest=path.join(out,'tamper-'+name);await fs.cp(moved,dest,{recursive:true});
  if(name==='height'){const b=await fs.readFile(path.join(dest,file));b[b.length-1]^=1;await fs.writeFile(path.join(dest,file),b);}
  else{const d=await load(path.join(dest,file));if(name==='request')d.source.re+='1';else d.definition.recipe.source.re+='1';await save(path.join(dest,file),d);}
  const transport=await load(path.join(dest,'bundle.json'));transport.files[file]=hash(await fs.readFile(path.join(dest,file)));await save(path.join(dest,'bundle.json'),transport);
  const rejected=await exec(['scripts/generation/create-parent.py','--verify',dest],false);assert.match(rejected.stderr,/Request key mismatch|Resolved definition mismatch/);
 }
 report.checks.push('All three identity tamper controls reject after transport hashes are recomputed');
 await frozen();report.checks.push('Original failed experiment all generated data and mathematical source hashes still match after CPU completion');
 assert.ok(Date.now()<=deadline,'120s bound');report.pass=true;
}catch(error){report.failure=error.stack??String(error);process.exitCode=1;console.error(report.failure);}
finally{report.ended=Date.now();report.cleanup=report.processes.every(x=>x.cleanup!=='unconfirmed');await save(path.join(out,'verification.json'),report);console.log(JSON.stringify({pass:report.pass,cleanup:report.cleanup,checks:report.checks,failure:report.failure}));}
