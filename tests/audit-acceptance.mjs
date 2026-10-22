// Offline integration test: real temporary Git repository, no browser/GPU.
// Not a unit test: the unit guard intentionally forbids launching even Git.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {runAudit, OUTPUT_PATH} from '../scripts/audit-gates-1b1.mjs';
import {TRANSITION} from '../scripts/gate/acceptance.mjs';
import {requiredIdsFromManifest} from '../scripts/gate/ledger.mjs';
if(process.env.ATLAS_UNIT_MODE) throw Error('offline Git integration must run outside the guarded unit process');
const integrationReport=[],passName='The audit wrapper validates a real Git range and large shards with pinned evidence';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir('artifacts/runtime',{recursive:true});
const root=await mkdtemp(resolve('artifacts/runtime/audit-git-'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000,maxBuffer:64*1024*1024}).trim();
const save=async(path,value)=>{await mkdir(dirname(resolve(root,path)),{recursive:true});await writeFile(resolve(root,path),typeof value==='string'?value:JSON.stringify(value));};
try {
  git('init');git('config','user.name','Audit fixture');git('config','user.email','audit@example.invalid');
  await save('.gitignore','artifacts/\ndocs/reports/project1b/gate-ledger-1b1.json\n');git('add','.gitignore');git('commit','-m','fixture base');const base=git('rev-parse','HEAD');
  const suites={build:{requiredFiles:[]},suites:[]};
  await save('tests/suites.manifest.json',suites);await save('tests/unit.manifest.json',{files:['unit.js']});
  // Larger than execFileSync's default 1 MiB buffer, but valid frozen-shard shape.
  const shard=JSON.stringify({strata:[{id:'mandatory',role:'mandatory',padding:'x'.repeat(2**20+1000)}]})+'\n';
  await save('tests/reference/large.json',shard);
  await save('tests/reference/space-matrix.json',{matrixSha256:'matrix',shards:[{path:'large.json',sha256:hash(shard)}]});
  git('add','tests');git('commit','-m','fixture implementation');const head=git('rev-parse','HEAD');
  const requiredIds=requiredIdsFromManifest(suites),gate={schema:'atlas.plane-gate',schemaVersion:1,commit:head,requiredIds,results:Object.fromEntries(requiredIds.map(id=>[id,{state:'passed'}])),overall:{state:'passed'}};
  await save('artifacts/gates/full.json',gate);await save('artifacts/gates/ledger.jsonl',JSON.stringify({commit:head,record:'artifacts/gates/full.json'})+'\n');
  const evidence=JSON.stringify([{name:'environment',headed:true,source:{commit:head,dirty:false}},{matrixSha256:'matrix',rows:[{id:'mandatory',role:'mandatory',state:'passed',passed:true}]}]);
  await save('artifacts/strata.json',evidence);
  const manifest={schema:'atlas.acceptance',schemaVersion:1,policyVersion:1,base,head,cutover:TRANSITION.cutover,retrospective:TRANSITION.retrospective,approval:{approvedBy:'user',date:'2026-10-21',source:'fixture'},docsFastAllowlist:[],commits:[{commit:head,disposition:'integration-gated',gate:'artifacts/gates/full.json'}],stratumEvidence:[{file:'artifacts/strata.json',sha256:hash(evidence),commit:head}]};
  await save('artifacts/acceptance.json',manifest);
  const options={base,head,manifest:'artifacts/acceptance.json',roots:[],output:OUTPUT_PATH};
  const run=()=>runAudit(options,{root});
  assert.equal((await run()).audit.accepted,true,'large-shard accepted baseline');
  assert.equal(JSON.parse(await readFile(resolve(root,OUTPUT_PATH))).implementationHead,head);
  manifest.commits[0].disposition='unknown';await save(options.manifest,manifest);
  const bad=await run();assert.equal(bad.audit.rows.length,1);assert.match(bad.audit.rows[0].reason,/unknown disposition/);assert.equal(bad.audit.accepted,false);
  manifest.commits[0].disposition='integration-gated';manifest.stratumEvidence[0].sha256='0'.repeat(64);await save(options.manifest,manifest);
  assert.ok((await run()).audit.errors.some(e=>e.includes('stratum evidence hash')));
  manifest.stratumEvidence[0].sha256=hash(evidence);
  const short=evidence.replace(head,head.slice(0,7));await save('artifacts/strata.json',short);manifest.stratumEvidence[0].sha256=hash(short);await save(options.manifest,manifest);
  assert.ok((await run()).audit.errors.some(e=>e.includes('source identity')));
  integrationReport.push({name:passName});console.log(`PASS ${passName}`);
} catch(error) {integrationReport.push({name:'FAIL',error:String(error.stack??error)});throw error;}
finally {await rm(root,{recursive:true,force:true});await writeFile('artifacts/acceptance-audit-report.json',JSON.stringify(integrationReport,null,2)+'\n');}
