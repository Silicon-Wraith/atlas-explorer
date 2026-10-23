import assert from 'node:assert/strict';
import { ev, LIMITS, idleWithin } from './bounded.mjs';
export async function runDraftSummary({page,url,report,pass}){
  await page.goto(url);await page.waitForFunction(()=>document.body.dataset.ready==='true');await idleWithin(page);
  const result=await ev(page,async()=>{const{checkGpuDraftSummary}=await import('/tests/support/draft-summary-gpu.mjs');return checkGpuDraftSummary();},undefined,'GPU/full packet summary equivalence',LIMITS.deep);
  report.push({name:'REC-G same-packet GPU equivalence',...result});assert.equal(result.checks.length,39);pass('REC-G GPU summaries equal full decode of the same packets',result);
}
