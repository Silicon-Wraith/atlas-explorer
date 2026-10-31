// Native-free maintained CPU generation contract. Never runs from Node unit tests.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {runBounded} from '../scripts/gate/supervise.mjs';
import {validateEvidence,classifySuiteRun} from '../scripts/gate/lib.mjs';
import {createSourceRecipe,sourceRecipeKey} from '../src/space/generation/source-recipe.js';
import {createRecursiveRecipe,recursiveRecipeKey} from '../src/space/generation/recursive-recipe.js';
import {canonicalJson} from '../src/shared/scene.js';
import {readSourceBundle} from '../scripts/generation/source-bundle.mjs';
import {verifyGenerationBundle} from '../scripts/generation/config.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
const root=path.resolve(process.argv[2]??process.env.ATLAS_GENERATION_CONTRACT_ROOT??'/mnt/ml_storage/scratch/atlas-md2a22b/contracts-'+new Date().toISOString().replace(/[:.]/g,'-'));
if(!root.startsWith('/mnt/ml_storage/scratch/'))throw Error('Private scratch evidence root required');
await fs.mkdir(root);const started=Date.now(),report=[],detail={started,root,nativeFree:true,cleanup:true};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const pass=name=>{report.push({name});console.log('PASS '+name);};
const suite=(await read(path.join(project,'tests/suites.manifest.json'))).suites.find(s=>s.id==='generation-contract');
let deadline=setTimeout(()=>{console.error('CPU generation contract deadline');process.exit(124);},60000);
try{
 const python=process.env.ATLAS_REFERENCE_PYTHON;
 assert.ok(python&&path.isAbsolute(python),'ATLAS_REFERENCE_PYTHON must name an installed CPU Python with NumPy');
 const corpus=await read(path.join(project,'tests/reference/generation-recipe-cases.json')),node={};
 for(const[group,codec,key]of[['sourceCases',createSourceRecipe,sourceRecipeKey],['recursiveCases',createRecursiveRecipe,recursiveRecipeKey]]){
  node[group]=[];
  for(const c of corpus[group]){
   let value,accepted=false;try{value=codec(JSON.parse(c.json));accepted=true;}catch{}
   assert.equal(accepted,c.accept,c.id);
   node[group].push({id:c.id,accepted,...(accepted?{canonical:canonicalJson(value),key:await key(value)}:{})});
  }
 }
 await fs.writeFile(path.join(root,'node-results.json'),JSON.stringify(node));
 detail.pythonRun=await runBounded({spawnFn:spawn,command:python,args:['-B',path.join(project,'scripts/generation/check-recursive-inputs.py'),root],timeoutMs:45000,cleanupMs:1000,options:{cwd:project,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}}});
 await fs.writeFile(path.join(root,'python-stdout.log'),detail.pythonRun.stdout);await fs.writeFile(path.join(root,'python-stderr.log'),detail.pythonRun.stderr);
 detail.cleanup=['confirmed','not-needed'].includes(detail.pythonRun.cleanup);
 assert.ok(detail.cleanup,'CPU child cleanup unconfirmed');
 assert.equal(detail.pythonRun.timedOut,false,'CPU child exceeded deadline');
 assert.equal(detail.pythonRun.exitCode,0,detail.pythonRun.stderr+'\n'+detail.pythonRun.stdout);
 const py=await read(path.join(root,'python-results.json'));assert.equal(py.pass_,true,py.error);detail.python=py;
 for(const name of ['parity','projection','parent','policy','bundles'])assert.ok(py.checks.some(c=>c.name===name),'Missing Python check '+name);
 pass('JS and Python recipe verdicts canonical bytes and identities agree on the frozen corpus');
 pass('Imported component and descendant numeric bits match the independent static reference');
 pass('Immutable parent arrays and evaluator bindings pass relocation and corruption controls');
 pass('Synthetic status decisions preserve the original policy and existing source bundles verify');
 const baseline=await read(path.join(project,'tests/reference/generation-runtime-baseline.json'));
 for(const[file,expected]of Object.entries(baseline.files))assert.equal(hash(await fs.readFile(path.join(project,file))),expected,'Preexisting runtime changed '+file);
 async function checkImports(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await checkImports(file);else if(/\.(js|mjs|py)$/.test(entry.name)&&file!==path.join(project,'src/space/generation/recursive-recipe.js'))assert.doesNotMatch(await fs.readFile(file,'utf8'),/recursive[-_]recipe/,'New production codec import '+file);}}
 await checkImports(path.join(project,'src'));await checkImports(path.join(project,'scripts/preparation'));
 detail.runtimeBaseline={base:baseline.base,files:Object.keys(baseline.files).length,sha256:hash(await fs.readFile(path.join(project,'tests/reference/generation-runtime-baseline.json')))};
 const generation=await verifyGenerationBundle();detail.importValidation={modules:generation.modules,inputs:generation.inputs};
 // Recompute the installed source certificate's actual source list and Node key, without a helper or GPU.
 const adapter=await fs.readFile(path.join(project,'scripts/preparation/source-adapter.mjs'),'utf8'),list=adapter.match(/const sourceFiles=(\[[\s\S]+?\]);/);
 assert.ok(list,'Source certificate source list missing');const names=[...list[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);assert.ok(names.length);
 assert.ok(!names.includes('scripts/generation/create-parent.py')&&!names.includes('scripts/generation/source_recipe.py'));
 const sources=await Promise.all(names.map(async role=>({role,sha256:hash(await fs.readFile(path.join(project,role)))})));
 const certificate=await read(path.join(project,'scripts/generation/source-world-certificates.json'));
 const sourcesKey=hash(canonicalJson({sources,packages:{node:process.versions.node}}));assert.equal(sourcesKey,certificate.sourcesKey,'Installed certificate source key changed');
 detail.sourceCertificate={sourcesKey,inputs:{}};
 for(const name of ['A','B']){const bundle=await readSourceBundle(path.join(project,'tests/reference/source-parent-controls',name));const world=certificate.worlds.find(w=>w.definitionKey===bundle.definition.definitionKey);assert.ok(world,'Existing input absent from installed certificate');assert.equal(world.inputKey,bundle.inputKey);detail.sourceCertificate.inputs[name]={definitionKey:world.definitionKey,inputKey:world.inputKey};}
 pass('Existing application native representation inputs and certificates remain byte-identical and unimported');
 // The gate's real classifier is exercised against success, failure and absent toolchain evidence.
 const evidence=report.concat([{name:'CPU contract evidence classifies honestly and its owned child cleanup is confirmed'}]);
 assert.equal(validateEvidence(suite,{report:evidence}).ok,true);
 assert.equal(classifySuiteRun({...detail.pythonRun,stdout:'',stderr:''},validateEvidence(suite,{report:evidence})).state,'passed');
 assert.equal(classifySuiteRun({exitCode:1},validateEvidence(suite,{report:[{name:'FAIL'}]})).state,'failed');
 assert.equal(classifySuiteRun({exitCode:0,spawnError:'missing Python'},validateEvidence(suite,{})).state,'incomplete');
 assert.equal(classifySuiteRun({exitCode:0},validateEvidence(suite,{report:evidence.slice(1)})).state,'failed');
 pass('CPU contract evidence classifies honestly and its owned child cleanup is confirmed');
 const changed=['src/space/generation/recursive-recipe.js','scripts/generation/recursive_recipe.py','scripts/generation/source_recipe.py','scripts/generation/create-parent.py','scripts/generation/check-recursive-inputs.py','scripts/generation/examples/regression-recursive.json','tests/generation-contract.mjs','tests/reference/generation-recipe-cases.json','tests/suites.manifest.json'];
 detail.hashes=Object.fromEntries(await Promise.all(changed.map(async file=>[file,hash(await fs.readFile(path.join(project,file)))])));detail.pass=true;
}catch(error){detail.error=error.stack??String(error);report.push({name:'FAIL',error:detail.error});process.exitCode=detail.cleanup?1:125;console.error(detail.error);}
finally{
 clearTimeout(deadline);detail.ended=Date.now();detail.elapsedMs=detail.ended-started;
 await fs.writeFile(path.join(root,'contract.json'),JSON.stringify(detail,null,2)+'\n');await fs.mkdir(path.join(project,'artifacts'),{recursive:true});await fs.writeFile(path.join(project,suite.report),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({root,pass:detail.pass??false,cleanup:detail.cleanup,elapsedMs:detail.elapsedMs}));
}
