// Bounded native experiment, deliberately outside the browser product gate.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runBounded } from '../gate/supervise.mjs';
import { sourceCase } from '../../tests/support/source-recipes.mjs';
import { createSourceRecipe, sourceRecipeKey, createParentDefinition } from '../../src/space/generation/source-recipe.js';
import { canonicalJson } from '../../src/shared/scene.js';

async function main(){
const referencePython=process.env.ATLAS_REFERENCE_PYTHON;
if(!referencePython)throw Error('Set ATLAS_REFERENCE_PYTHON to a CPU interpreter with NumPy and mpmath');
let referencePid;
const probe=await runBounded({spawnFn:(...args)=>{const child=spawn(...args);referencePid=child.pid;return child;},
 command:referencePython,args:['scripts/generation/probe-reference.py'],timeoutMs:15000,
 options:{cwd:process.cwd(),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}}});
assert.notEqual(probe.cleanup,'unconfirmed');assert.equal(probe.timedOut,false);
assert.equal(probe.exitCode,0,probe.stderr||probe.spawnError||probe.stdout);
const referenceEnvironment=JSON.parse(probe.stdout);assert.equal(referenceEnvironment.cudaImported,false);
assert.equal(path.resolve(referenceEnvironment.sourceRecipeFile),path.resolve('scripts/generation/source_recipe.py'));
if(process.argv[2]==='--preflight'){console.log(JSON.stringify(referenceEnvironment));return;}
if(!process.env.ATLAS_GPU_HANDOFF||process.env.ATLAS_GPU_DEFERRED)throw Error('One exclusive GPU handoff required');
const root=path.resolve(process.argv[2]??'');
if(!root.startsWith('/mnt/ml_storage/scratch/atlas-md2a2/'))throw Error('Private atlas-md2a2 scratch root required');
await fs.mkdir(root);const python=process.env.ATLAS_GENERATION_PYTHON??'/mnt/ml_storage/scratch/venvs/gpu/bin/python';
const detail={started:Date.now(),pass:false,checks:[],processes:[],ownedPids:[process.pid,referencePid],runs:[],referenceEnvironment};
const deadline=Date.now()+180000;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const load=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const save=async(p,d)=>fs.writeFile(p,JSON.stringify(d,null,2)+'\n');
function pass(name){detail.checks.push(name);console.log('PASS '+name);}
async function command(args,expectSuccess=true,interpreter=python){
 const remaining=deadline-Date.now();if(remaining<=0)throw Error('180 second experiment bound exhausted');
 const run=await runBounded({spawnFn:(...args)=>{const child=spawn(...args);if(child.pid)detail.ownedPids.push(child.pid);return child;},command:interpreter,args,
  options:{cwd:process.cwd(),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}},timeoutMs:remaining,cleanupMs:5000});
 detail.processes.push({args,...run});
 assert.notEqual(run.cleanup,'unconfirmed','Physical child group cleanup required');
 assert.equal(run.timedOut,false,'Experiment incomplete after timeout');
 if(expectSuccess)assert.equal(run.exitCode,0,run.stderr||run.stdout||run.spawnError);
 else assert.notEqual(run.exitCode,0,'Tamper must reject');
 return run;
}
try{
 const files={};
 for(const name of ['A','B','unknown','deep']){
  const recipe=createSourceRecipe(sourceCase(name));const file=path.join(root,name+'.json');await save(file,recipe);files[name]=file;
  const checked=JSON.parse((await command(['scripts/generation/create-parent.py',file,'--inspect'])).stdout);
  assert.equal(checked.canonical,canonicalJson(recipe));assert.equal(checked.requestKey,await sourceRecipeKey(recipe));assert.equal(checked.cudaImported,false);
  assert.equal(checked.status,name==='deep'?'unsupported':'supported');
 }
 pass('Exact JS Python source bytes and SHA-256 agree; valid deep source is numerically unsupported before CUDA');
 for(const [name,caseName,chunk,reverse] of [['A','A',4096,false],['B','B',4096,false],['B-rebuild','B',127,true],['A-rebuild','A',127,true],['unknown','unknown',4096,false],['deep','deep',4096,false]]){
  const out=path.join(root,name);await command(['scripts/generation/create-parent.py',files[caseName],'--out',out,'--chunk-size',String(chunk),...(reverse?['--reverse']:[])]);
  const result=await load(path.join(out,'bundle/result.json'));detail.runs.push({name,...result});
  assert.equal(result.requestKey,await sourceRecipeKey(sourceCase(caseName)));
  if(['A','B'].includes(caseName)){
   assert.equal(result.status,'resolved',result.reason);assert.equal(result.sampleCount,4225);assert.equal(result.counts['0'],0);assert.equal(result.counts['4'],0);
   assert.match(result.provenance.device,/NVIDIA|RTX/);assert.equal(result.cudaImported,true);
   assert.deepEqual(result.definition,await createParentDefinition(sourceCase(caseName),result.definition.surface.logicalSha256));
  }else{
   assert.equal(result.status,caseName==='deep'?'unsupported':'unresolved');assert.equal(result.definition,null);
   await assert.rejects(fs.access(path.join(out,'bundle/height.npy')));
   if(caseName==='unknown')assert.ok(result.counts['0']>0);else assert.equal(result.cudaImported,false);
  }
 }
 pass('Both frozen positive sources produce fresh resolved CUDA parent grids; unknown and unsupported cases grant no height surface');
 for(const name of ['A','B']){
  const original=detail.runs.find(x=>x.name===name),rebuilt=detail.runs.find(x=>x.name===name+'-rebuild');
  assert.deepEqual(original.definition,rebuilt.definition);
  assert.equal(hash(await fs.readFile(path.join(root,name,'bundle/height.npy'))),hash(await fs.readFile(path.join(root,name+'-rebuild','bundle/height.npy'))));
 }
 pass('Reverse source order reversed point order and different chunks preserve logical arrays and resolved definitions exactly');
 await command(['scripts/generation/check-parent.py',path.join(root,'A'),path.join(root,'B'),path.join(root,'mathematics.json')],true,referencePython);
 detail.mathematics=await load(path.join(root,'mathematics.json'));assert.equal(detail.mathematics.pass_,true);assert.equal(detail.mathematics.cudaImported,false);
 pass('Independent 50-digit source evaluation agrees at all 64 frozen sample selections and both source surfaces differ');
 const moved=path.join(root,'relocated');await fs.cp(path.join(root,'A/bundle'),moved,{recursive:true});
 await command(['scripts/generation/create-parent.py','--verify',moved]);
 pass('A relocated complete numeric bundle verifies without original output paths');
 for(const [name,file] of [['request','recipe.json'],['result','result.json'],['height','height.npy']]){
  const dest=path.join(root,'tamper-'+name);await fs.cp(moved,dest,{recursive:true});
  if(name==='height'){const data=await fs.readFile(path.join(dest,file));data[data.length-1]^=1;await fs.writeFile(path.join(dest,file),data);}
  else{const value=await load(path.join(dest,file));if(name==='request')value.source.re+='1';else value.definition.recipe.source.re+='1';await save(path.join(dest,file),value);}
  // Rehash transport too: the test must reach mathematical identity validation.
  const manifest=await load(path.join(dest,'bundle.json'));manifest.files[file]=hash(await fs.readFile(path.join(dest,file)));await save(path.join(dest,'bundle.json'),manifest);
  const failed=await command(['scripts/generation/create-parent.py','--verify',dest],false);
  assert.match(failed.stderr,/Request key mismatch|Resolved definition mismatch/);
 }
 pass('Mutated request result and height cannot retain identity even with updated transport hashes');
 assert.ok(Date.now()<=deadline,'180 second comparison bound exhausted');detail.pass=true;
}catch(error){detail.failure=error.stack??String(error);process.exitCode=1;console.error(detail.failure);}
finally{
 detail.ended=Date.now();detail.cleanup=detail.processes.every(x=>x.cleanup!=='unconfirmed');
 await save(path.join(root,'experiment.json'),detail);console.log(JSON.stringify({root,pass:detail.pass,cleanup:detail.cleanup,failure:detail.failure}));
}

}
await main();
