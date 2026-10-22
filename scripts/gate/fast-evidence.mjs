// A source index is a pointer into contemporaneous prose, never a replacement
// test result. The controller pins the original ledger bytes and exact excerpts.
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function readContemporaneousFast(inputs, {root, resolveCommit}) {
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
      const mentions=[...excerpt.matchAll(/\b[0-9a-f]{7,40}\b/g)].map(m=>{try{return resolveCommit(m[0]);}catch{return null;}});
      if(!mentions.includes(entry.commit))throw Error('contemporaneous pass lacks same-SHA association');
      // "fast checks" has the plan-defined unit + build meaning. Do not infer
      // a pass from a test count elsewhere in the log or a new retrospective run.
      if(entry.unit!=='passed'||entry.build!=='passed'||!Number.isFinite(Date.parse(entry.recordedAt))||
         !/fast checks(?:\s+(?:pass(?:ed)?|\d+[^\n;.]*\+\s*build))/i.test(excerpt)||
         /fast checks[^\n;.]*\b(?:fail(?:ed)?|pending|held)\b/i.test(excerpt))throw Error('ledger does not explicitly record passing fast checks');
      rows.set(entry.commit,entry);
    }
  }
  return rows;
}
