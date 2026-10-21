// spikes/project0/precision-validation/generate.mjs — node spikes/project0/precision-validation/generate.mjs --check | --write
// T12 fix round 1 (Codex T12 r1, finding 1): the supplemental validation corpus, preregistered in docs/reports/project0/t12-validation-prereg.md
// before any GPU run of T12. Deterministic: --write regenerates precision-validation/corpus-v1.json (canonical() + LF); --check regenerates it
// and compares the committed bytes and the pinned hashes (precision-config.js). Each case's expected result comes from the binary32 model of
// compensated.wgsl and is proven error-free against the exact dyadic operation (remediation/exact.js), so the expectation is the exact result.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { canonical } from '../contract.js';
import { fromNumber, add, mul, compare } from '../remediation/exact.js';
import { primitiveCase, word } from './models.js';
import { PRECISION_CORPUS } from '../precision-config.js';

export const CORPUS_URL = new URL('./corpus-v1.json', import.meta.url);
const sha = s => createHash('sha256').update(s).digest('hex');
const p2 = e => 2 ** e;
const A = 1 + p2(-23), B = 1 + 3 * p2(-23);
// Each case: [op, args, thenAdd, why]. Every one has a nonzero residual that eliminated compensation loses, and an exact result.
const CASES = [
  ['mul_ff_f32', [[A, 0], A], [-(1 + p2(-22)), 0], 'inexact TwoProduct: (1+2^-23)^2 = (1+2^-22) + 2^-46; split exercised (hi 1, lo 2^-23)'],
  ['mul_ff_f32', [[A, 0], B], [-(1 + p2(-21)), 0], 'inexact TwoProduct: (1+2^-23)(1+3*2^-23) = (1+2^-21) + 3*2^-46'],
  ['mul_ff_f32', [[-A, 0], A], [1 + p2(-22), 0], 'inexact TwoProduct, negative: -(1+2^-22) - 2^-46'],
  ['add_ff', [[1, 0], [p2(-25), 0]], [-1, 0], 'add_ff TwoSum residual: 1 + 2^-25, then cancellation leaves 2^-25'],
  ['add_ff', [[1, p2(-30)], [p2(-25), 0]], [-1, 0], 'add_ff residual with a low part: 1 + 2^-25 + 2^-30'],
  ['add_ff', [[1, 0], [-p2(-25), 0]], [-1, 0], 'add_ff residual on a rounding tie: 1 - 2^-25 rounds to 1, residual -2^-25'],
];

const exactOf = (op, a, b) => {
  const P = v => (Array.isArray(v) ? add(fromNumber(Math.fround(v[0])), fromNumber(Math.fround(v[1]))) : fromNumber(Math.fround(v)));
  return op === 'add_ff' ? add(P(a), P(b)) : op === 'mul_ff_f32' ? mul(P(a), P(b)) : add(P(a), P(b));
};
export function buildCorpus() {
  const primitives = CASES.map(([op, args, thenAdd, why]) => {
    const r = primitiveCase({ op, args, thenAdd });
    const got = add(fromNumber(r.hi), fromNumber(r.lo)), exact = exactOf(op, args[0], args[1]);
    if (compare(got, exact) !== 0) throw new Error(`${why}: the model is not error-free`);
    const then = add(fromNumber(r.thenHi), fromNumber(r.thenLo)), thenExact = add(exact, exactOf('add_ff', thenAdd, 0));
    if (compare(then, thenExact) !== 0) throw new Error(`${why}: the then-add is not error-free`);
    return { op, args, thenAdd, why, value: r.hi + r.lo, thenValue: r.thenHi + r.thenLo, expected: { hi: word(r.hi), lo: word(r.lo), thenHi: word(r.thenHi), thenLo: word(r.thenLo) } };
  });
  return {
    schema: 1, id: 't12-validation-v1',
    rule: 'value-exact: hi + lo and thenHi + thenLo must equal the expected pairs as exact dyadic values (low-word bits are not compared)',
    primitives,
    capture: { rays: 8, steps: 16, relativeBoundExponent: -40, absoluteFloorExponent: -120, minimumDiscriminating: { mul: 64, addOrigin: 64, addT: 32 } },
  };
}
export const corpusText = () => `${canonical(buildCorpus())}\n`;
export const expectedSha256 = corpus => sha(canonical(corpus.primitives.map(c => c.expected)));

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = corpusText();
  if (process.argv.includes('--write')) { writeFileSync(CORPUS_URL, text); console.log(`wrote ${CORPUS_URL.pathname}: ${sha(text)}`); }
  else {
    const committed = readFileSync(CORPUS_URL, 'utf8');
    if (committed !== text) throw new Error('corpus-v1.json differs from its regeneration');
    if (sha(committed) !== PRECISION_CORPUS.sha256) throw new Error(`corpus hash ${sha(committed)} differs from the pin ${PRECISION_CORPUS.sha256}`);
    if (expectedSha256(JSON.parse(committed)) !== PRECISION_CORPUS.expectedSha256) throw new Error('expected-words hash differs from the pin');
    console.log(`CORPUS OK ${sha(committed)}`);
  }
}
