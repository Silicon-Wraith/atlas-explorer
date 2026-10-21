// spikes/project0/tests/precision-helpers.mjs — T12 fix round 1: complete precision raws for the Node tests (never evidence). A complete raw
// now also carries the supplemental validation results, the in-kernel captures, policy-conformant batch evidence, `complete: true` and the
// cost span; the brief's own fields (primitives, words, samples, peak bytes) are passed in unchanged.
import { readFile } from 'node:fs/promises';
import { primitiveCase, synthesizeCaptures } from '../precision-validation/models.js';
import { PRECISION_CORPUS, BATCH_POLICY } from '../precision-config.js';

export const corpus = JSON.parse(await readFile(new URL('../precision-validation/corpus-v1.json', import.meta.url), 'utf8'));

// Serial 10 ms batches of the initial size: inside the policy band, so every run keeps the initial batch.
export function policyRuns(fx, n, batch = BATCH_POLICY.initialBatch) {
  return Array.from({ length: fx.costProtocol.warmups + fx.costProtocol.measured }, (_, k) => {
    const batches = Array.from({ length: Math.ceil(n / batch) }, (_, i) => ({ start: i * batch, count: Math.min(batch, n - i * batch), submitMs: 10 * i, doneMs: 10 * i + 10 }));
    return { k, measured: k >= fx.costProtocol.warmups, batch, batches, maxOutstanding: 1 };
  });
}

export function completeRaw(fx, raw, { variant = 'correct' } = {}) {
  return {
    ...raw, complete: true, validationBytes: 400, costProtocolMs: 4321.5,
    supplement: { corpusSha256: PRECISION_CORPUS.sha256, primitives: corpus.primitives.map(c => primitiveCase(c, variant)) },
    sets: raw.sets.map((s, i) => {
      const set = fx.precision.results[i];
      return { ...s, complete: true, captureWords: synthesizeCaptures(set, corpus.capture, variant), captureStorageBytes: corpus.capture.rays * corpus.capture.steps * 64, captureStagingBytes: corpus.capture.rays * corpus.capture.steps * 64,
        baseline: { ...s.baseline, runs: policyRuns(fx, set.rows.length), allocations: [] }, compensated: { ...s.compensated, runs: policyRuns(fx, set.rows.length), allocations: [] } };
    }),
  };
}
