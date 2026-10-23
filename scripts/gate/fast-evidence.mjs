// A source index is a pointer into contemporaneous prose, never a replacement
// test result. The controller pins the original ledger bytes and exact excerpts.
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {approvedWipEvidencePolicy} from './acceptance.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Bind prose to an explicit Commit/Candidate/Promotion owner. Parent/tree SHAs
// inside that owner's clause are references, not alternative owners. A new
// named owner, sentence or line ends the scope; an unbound phrase fails closed.
function ownedClauses(excerpt, commit, resolveCommit) {
  const clauses=[];
  for(const sentence of excerpt.split(/(?:[.!?](?=\s|$)|\r?\n)/)) {
    const owners=[...sentence.matchAll(/\b(?:commit|candidate|promotion)\s+([0-9a-f]{7,40})\b/gi)];
    for(let i=0;i<owners.length;i++) {
      // Require a clause heading, optionally preceded by a task label (B13,
      // T04a). "references commit A" is not a claim about A's checks.
      const preceding=sentence.slice(0,owners[i].index);
      const heading=preceding.slice(Math.max(preceding.lastIndexOf(';'),preceding.lastIndexOf(':'))+1).trim();
      if(!/^(?:[BT]\d+[\w./-]*)?$/i.test(heading))continue;
      let owner;try{owner=resolveCommit(owners[i][1]);}catch{continue;}
      if(owner===commit)clauses.push(sentence.slice(owners[i].index+owners[i][0].length,owners[i+1]?.index??sentence.length));
    }
  }
  return clauses;
}
export async function readContemporaneousFast(inputs, {root, resolveCommit, commitTimeFor, wipEvidencePolicy}) {
  if(wipEvidencePolicy && !approvedWipEvidencePolicy(wipEvidencePolicy))throw Error('unapproved contemporaneous timestamp policy');
  const rows=new Map();
  for(const input of inputs ?? []) {
    const indexPath=resolve(root,input.file), bytes=await readFile(indexPath);
    if(!/^[0-9a-f]{64}$/.test(input.sha256??'')||hash(bytes)!==input.sha256)throw Error('contemporaneous index hash mismatch');
    const index=JSON.parse(bytes);
    if(index.schema!=='atlas.contemporaneous-fast-index'||index.schemaVersion!==1||!Array.isArray(index.entries))throw Error('invalid contemporaneous index');
    for(const entry of index.entries) {
      if(!/^[0-9a-f]{40}$/.test(entry.commit??'')||rows.has(entry.commit))throw Error('invalid or duplicate contemporaneous commit');
      const source=entry.source, raw=await readFile(resolve(dirname(indexPath),source.file));
      if(hash(raw)!==source.sha256)throw Error('contemporaneous ledger hash mismatch');
      const lines=raw.toString('utf8').split('\n');
      if(!Number.isInteger(source.startLine)||!Number.isInteger(source.endLine)||source.startLine<1||source.endLine<source.startLine||source.endLine>lines.length)throw Error('invalid contemporaneous excerpt lines');
      const excerpt=lines.slice(source.startLine-1,source.endLine).join('\n');
      if(excerpt!==source.excerpt)throw Error('contemporaneous excerpt differs from ledger');
      const clauses=ownedClauses(excerpt,entry.commit,resolveCommit);
      if(!clauses.some(clause=>/\bfast checks\b/i.test(clause)))throw Error('contemporaneous pass lacks same-SHA clause association');
      // "fast checks" has the plan-defined unit + build meaning. Do not infer
      // a pass from a test count elsewhere in the log or a new retrospective run.
      if(entry.unit!=='passed'||entry.build!=='passed'||!Number.isFinite(Date.parse(entry.recordedAt))||
         !clauses.some(clause=>/fast checks\s+(?:pass(?:ed)?\b|\d+[^\n;.]*\+\s*build\b)/i.test(clause))||
         clauses.some(clause=>/fast checks[^\n;.]*\b(?:fail(?:ed)?|pending|held)\b/i.test(clause)))throw Error('ledger does not explicitly record passing fast checks');
      if(wipEvidencePolicy?.commitTimeLowerBoundCommits.includes(entry.commit)) {
        const time=commitTimeFor?.(entry.commit);
        if(!Number.isFinite(time)||!Number.isFinite(new Date(time*1000).getTime())||Date.parse(entry.recordedAt)!==time*1000)
          throw Error('undated contemporaneous recordedAt must equal the Git commit time');
        // Keep source/index bytes pinned. Record the explicit interpretation in
        // the loaded evidence, audit output and newly written fast-check record.
        rows.set(entry.commit,{...entry,recordedAt:new Date(time*1000).toISOString(),timestampBasis:wipEvidencePolicy.timestampBasis});
      } else {
        if(entry.timestampBasis==='commit-time-lower-bound')throw Error('commit-time-lower-bound requires the pinned SHA approval');
        rows.set(entry.commit,entry);
      }
    }
  }
  return rows;
}
