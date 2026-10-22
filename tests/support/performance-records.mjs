// Versioned append-only diagnostic confirmation protocol used by P3 and the ladder.
import { canonicalJson } from '../../src/shared/scene.js';
export const PERFORMANCE_RECORD_VERSION = 'atlas.performance-records-v2';
export function confirmedPublications(publications, updates = []) {
  const accepted=[], failures=[], pending=[], byFrame=new Map(), terminal=new Map();
  for(const p of publications) {
    if(p.diagnosticsState===undefined || p.diagnosticsState==='confirmed' && !p.frameId) { accepted.push(p);continue; }
    if(p.diagnosticsState!=='pending'||!p.frameId||byFrame.has(p.frameId)||p.eligible!==true||!p.identity||!Number.isFinite(p.presentationSubmittedAt)) {
      failures.push({frameId:p.frameId,reason:'invalid original frame record'});continue;
    }
    byFrame.set(p.frameId,p);
  }
  for(const u of updates) {
    const p=byFrame.get(u.frameId);
    if(!p||terminal.has(u.frameId)||canonicalJson(p.identity)!==canonicalJson(u.identity)) { failures.push({frameId:u.frameId,reason:'unknown, duplicate or conflicting update'});continue; }
    terminal.set(u.frameId,u);
    if(u.diagnosticsState!=='confirmed') { failures.push({frameId:u.frameId,reason:u.diagnosticsState});continue; }
    const at=Math.max(p.presentationSubmittedAt,u.observedAt);
    if(!Number.isFinite(u.observedAt)||u.observedAt<p.presentationSubmittedAt||u.confirmationAt!==u.observedAt||u.acceptanceAt!==at||
       u.completion?.outcome!=='completed'||!Number.isFinite(u.completion.queueCompletedAt)||u.completion.queueCompletedAt>u.observedAt||!u.rayTermination) {
      failures.push({frameId:u.frameId,reason:'invalid confirmed evidence'});continue;
    }
    accepted.push({...p,...u,publishedAt:at,presentationLatencyMs:p.presentationSubmittedAt-p.createdAt,confirmationLatencyMs:u.observedAt-p.createdAt});
  }
  for(const p of byFrame.values())if(!terminal.has(p.frameId))pending.push(p.frameId);
  accepted.sort((a,b)=>a.publishedAt-b.publishedAt);
  return {publications:accepted,failures,pending};
}
