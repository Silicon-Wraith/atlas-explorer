import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedPublications } from '../support/performance-records.mjs';
const original = n => ({frameId:`f${n}`,identity:{requestId:`r${n}`,generation:{deviceEpoch:1,viewRevision:n}},eligible:true,diagnosticsState:'pending',presentationSubmittedAt:n,publishedAt:n,rayTermination:null});
const update = (p, at) => ({frameId:p.frameId,identity:p.identity,diagnosticsState:'confirmed',observedAt:at,confirmationAt:at,acceptanceAt:at,completion:{outcome:'completed',queueCompletedAt:at-1},rayTermination:{hit:3}});
const validated = () => ({ kind: 'draft', identity: { requestId: 'r1', jobId: 'j1', viewId: 'space', generation: { deviceEpoch: 1, viewRevision: 1 } },
  sampleIndex: 0, eligible: true, historical: true, presentationSubmittedAt: 1, completion: { outcome: 'completed', queueCompletedAt: 2 },
  confirmationAt: 3, publishedAt: 4, rayTermination: { hit: 3 } });

test('B15-P19-1 P3 rejects duplicate ordinary draft identities even when historical flags differ', () => {
  const p = validated();
  const checked = confirmedPublications([p, { ...p, historical: false, publishedAt: 5 }]);
  assert.equal(checked.failures.length, 1, 'duplicate identity/sample is a protocol failure');
  assert.equal(checked.publications.length, 1);
});

test('B15-P19-1 P3 rejects unvalidated or backdated historical publications', () => {
  for (const change of [
    p => delete p.completion, p => p.completion.outcome = 'failed', p => p.completion.queueCompletedAt = 0,
    p => p.completion.queueCompletedAt = 4, p => p.confirmationAt = 5, p => delete p.confirmationAt,
    p => p.eligible = false, p => delete p.identity, p => delete p.sampleIndex, p => p.rayTermination = null,
  ]) {
    const p = validated(); change(p);
    assert.equal(confirmedPublications([p]).failures.length, 1, String(change));
    assert.equal(confirmedPublications([p]).publications.length, 0);
  }
});
test('B15-REC-G P3 counts reordered historical confirmations at observed acceptance time only', () => {
  const a=original(1),b=original(2);
  const result=confirmedPublications([a,b],[update(b,10),{...update(a,21),historical:true}]);
  assert.deepEqual(result.publications.map(p=>[p.frameId,p.publishedAt]),[['f2',10],['f1',21]]);
  assert.equal(result.publications.filter(p=>p.publishedAt<=20).length,1,'late confirmation cannot enter a closed measurement window');
  assert.equal(a.diagnosticsState,'pending');
});
test('B15-REC-G P3 rejects unknown conflicting and incomplete updates and retains late failures', () => {
  const a=original(1),b=original(2);
  for(const updates of [[update(b,10)],[{...update(a,10),identity:b.identity}],[update(a,10),update(a,10)],[{...update(a,10),completion:null}]]) {
    assert.ok(confirmedPublications([a],updates).failures.length);
  }
  assert.equal(confirmedPublications([a]).pending.length,1);
  const failure=confirmedPublications([a,b],[{...update(a,10),diagnosticsState:'failed',historical:true}, {...update(b,11),diagnosticsState:'interrupted'}]);
  assert.equal(failure.publications.length,0);assert.equal(failure.failures.length,2);
});
