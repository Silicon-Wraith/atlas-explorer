// Run checks on the target's own clean checkout and manifests. A retrospective
// record has the actual current run time; it never impersonates an old run.
import {execFileSync,spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runBounded} from './gate/supervise.mjs';
import {classifyUnit,parseTapSummary} from './gate/lib.mjs';
import {readContemporaneousFast} from './gate/fast-evidence.mjs';
import {judgeFast,approvedRetrospectiveWip,WIP_EVIDENCE_POLICY_SHA256} from './gate/acceptance.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const readWipPolicy=()=>JSON.parse(readFileSync(new URL('./gate/acceptance-policy-1b1.json',import.meta.url),'utf8')).wipEvidence;
export function parseFastOptions(args) {
  const result={checkout:'.',outputRoot:'.',retrospective:false};
  const names={'--checkout':'checkout','--expected-commit':'expectedCommit','--ledger-index':'ledgerIndex','--ledger-sha256':'ledgerSha256','--output-root':'outputRoot'};
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--retrospective')result.retrospective=true;
    else if(args[i]==='--retrospective-wip'){result.retrospective=true;result.retrospectiveWip=true;}
    else if(names[args[i]]&&args[i+1]){const name=names[args[i]];result[name]=args[++i];}
    else throw Error(`unknown or incomplete argument ${args[i]}`);
  }
  if(result.retrospectiveWip) {
    if(!approvedRetrospectiveWip(result.expectedCommit,readWipPolicy()))throw Error('retrospective WIP mode requires an approved full-SHA implementation WIP commit');
    if(result.ledgerIndex||result.ledgerSha256)throw Error('retrospective WIP mode does not consume a ledger input');
  } else if(result.retrospective&&(!/^[0-9a-f]{40}$/.test(result.expectedCommit??'')||!result.ledgerIndex||!/^[0-9a-f]{64}$/.test(result.ledgerSha256??'')))throw Error('retrospective mode requires expected-commit and pinned ledger input');
  return result;
}
export async function runFastChecks(options) {
  const root=resolve(options.checkout), git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000,maxBuffer:64*1024*1024}).trim();
  const commit=git('rev-parse','HEAD'), tree=git('rev-parse','HEAD^{tree}');
  if(options.expectedCommit&&options.expectedCommit!==commit)throw Error('checkout does not match expected commit');
  const wipEvidencePolicy=readWipPolicy();
  if(options.retrospectiveWip&&(!options.retrospective||options.expectedCommit!==commit||!approvedRetrospectiveWip(commit,wipEvidencePolicy)))throw Error('retrospective WIP target is not an approved full SHA');
  const contemporaneous=options.retrospective&&!options.retrospectiveWip?(await readContemporaneousFast([{file:resolve(options.ledgerIndex),sha256:options.ledgerSha256}],{
    root:dirname(resolve(options.ledgerIndex)),wipEvidencePolicy,resolveCommit:s=>git('rev-parse',`${s}^{commit}`),commitTimeFor:s=>Number(git('show','-s','--format=%ct',s))})).get(commit):null;
  if(options.retrospective&&!options.retrospectiveWip&&!contemporaneous)throw Error('no contemporaneous fast pass for target SHA');
  const record={schema:'atlas.fast-check',schemaVersion:1,commit,tree,startedAt:new Date().toISOString(),recordedRetrospectively:options.retrospective,
    ...(contemporaneous?{contemporaneous}:{}),
    ...(options.retrospectiveWip?{evidenceScope:'wip-only',wipEvidencePolicySha256:WIP_EVIDENCE_POLICY_SHA256}:{}),cleanBefore:git('status','--porcelain').length===0,
    manifests:{unit:hash(git('show',`${commit}:tests/unit.manifest.json`)),suites:hash(git('show',`${commit}:tests/suites.manifest.json`))}};
  const output=resolve(options.outputRoot,`artifacts/gates/fast/${commit}.json`);
  await mkdir(dirname(output),{recursive:true});
  if(record.cleanBefore) {
    const unit=await runBounded({spawnFn:spawn,command:process.execPath,args:['scripts/run-unit.mjs'],options:{cwd:root},timeoutMs:600000,echo:true});
    record.unit=classifyUnit(unit,parseTapSummary(unit.stdout));
    await writeFile(output.replace('.json','.unit.log'),unit.stdout+'\n'+unit.stderr);
    // An unconfirmed owned process tree stops further work.
    if(['confirmed','not-needed'].includes(unit.cleanup)) {
      const build=await runBounded({spawnFn:spawn,command:process.execPath,args:['scripts/build.mjs'],options:{cwd:root},timeoutMs:120000,echo:true});
      await writeFile(output.replace('.json','.build.log'),build.stdout+'\n'+build.stderr);
      const manifest=JSON.parse(await readFile(resolve(root,'tests/suites.manifest.json'),'utf8'));
      let files=true;for(const file of manifest.build.requiredFiles){try{await readFile(resolve(root,file));}catch{files=false;}}
      record.build={state:build.exitCode===0&&!build.timedOut&&!build.spawnError&&files?'passed':'failed'};
      record.cleanup=['confirmed','not-needed'].includes(build.cleanup)?'confirmed':'unconfirmed';
    } else record.cleanup='unconfirmed';
  }
  record.cleanAfter=git('status','--porcelain').length===0;record.unchanged=git('rev-parse','HEAD')===commit&&git('rev-parse','HEAD^{tree}')===tree;
  record.finishedAt=new Date().toISOString();
  const result=judgeFast(commit,record,{tree,committedAt:Number(git('show','-s','--format=%ct',commit))},record.manifests,contemporaneous,
    {wipEvidencePolicy:options.retrospectiveWip?wipEvidencePolicy:null});
  await writeFile(output,JSON.stringify(record,null,2)+'\n');return {output,result};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{const {output,result}=await runFastChecks(parseFastOptions(process.argv.slice(2)));console.log(output,JSON.stringify(result));process.exitCode=result.state==='passed'?0:1;}
  catch(error){console.error(error.stack);process.exitCode=1;}
}
