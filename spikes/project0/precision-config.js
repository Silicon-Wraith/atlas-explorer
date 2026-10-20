// spikes/project0/precision-config.js — T12 fix round 1 (Codex T12 r1, findings 1 and 5), preregistered in
// docs/reports/project0/t12-validation-prereg.md before any GPU run of T12. Pure: the page driver, the supervision plan and the Node
// interpretation share one definition.
//
// PRECISION_CORPUS: the supplemental validation corpus and its pinned hashes. The page fetches it and records the hash of the bytes it used;
// Node loads it only through this pin and refuses any other bytes.
export const PRECISION_CORPUS = Object.freeze({
  path: 'precision-validation/corpus-v1.json',
  sha256: '63f644eba111707490b1a83a2eaddece986e074861ec1213e45782cd460d491c',
  expectedSha256: '42f2d5a344eccd89fbba8317003b6a2125f63665ef2f91e4b8840932f2615681',
});

// BATCH_POLICY (plan Global Constraints, spec §5 "Batching": batches bounded to about 10 ms of GPU work, at most two outstanding; batch size is
// adjusted, never iterations, tolerance or resolution). Each implementation starts each distance at initialBatch. After every run, its batch
// observations decide the next run's size (nextBatch): the median per-batch duration of the run's full batches, each duration being
// doneMs[i] - max(submitMs[i], doneMs[i-1]) (with at most two outstanding the queue executes them in order), is kept if it lies within
// [lowMs, highMs]; otherwise the next size is the largest power of two whose estimated duration is at most targetMs, clamped to
// [minBatch, maxBatch]. Every run's size, batch rows and maximum outstanding count are kept as evidence.
export const BATCH_POLICY = Object.freeze({ initialBatch: 512, targetMs: 10, lowMs: 5, highMs: 20, minBatch: 64, maxBatch: 4096, maxOutstanding: 2 });

export function batchDurations(batches) {
  return batches.map((b, i) => b.doneMs - Math.max(b.submitMs, i ? batches[i - 1].doneMs : b.submitMs));
}
const median = xs => { const v = [...xs].sort((a, b) => a - b), n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; };
export function nextBatch(batches, current, policy = BATCH_POLICY) {
  if (!Array.isArray(batches) || !batches.length || batches.some(b => !Number.isFinite(b.submitMs) || !Number.isFinite(b.doneMs) || !(b.count > 0))) throw new Error('batch policy: every batch needs finite submitMs and doneMs and a positive count');
  const durations = batchDurations(batches), full = batches.map((b, i) => [b, durations[i]]).filter(([b]) => b.count === current);
  const used = full.length ? full : batches.map((b, i) => [b, durations[i]]);
  const ms = median(used.map(([, d]) => d)), perRay = ms / median(used.map(([b]) => b.count));
  if (full.length && ms >= policy.lowMs && ms <= policy.highMs) return current;
  if (!(perRay > 0)) return policy.maxBatch;
  let size = policy.minBatch;
  while (size * 2 <= policy.maxBatch && size * 2 * perRay <= policy.targetMs) size *= 2;
  return size;
}
// The most batches outstanding at once: at each submission, the earlier batches not yet done, plus this one.
export function maxOutstandingOf(batches) {
  let max = 0;
  batches.forEach((b, i) => { max = Math.max(max, 1 + batches.slice(0, i).filter(e => e.doneMs === null || e.doneMs > b.submitMs).length); });
  return max;
}
