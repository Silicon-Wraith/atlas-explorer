// spikes/project0/remediation/models.js — the five exact G5-A models (prereg rev 2 §2.2, §2.5) and the fixed supplementary inputs (§2.6).
// F is the preregistered operation graph with correctly rounded fusion only at explicit F calls. U unfuses each explicit F. S and DB
// contract the product-fed TwoSum(p, h) inside CompDot (s = F(x,y,p); db = F(x,y,-v)); SDB applies both. U, S, DB and SDB are
// diagnostic negative controls, never acceptable outcomes. The standalone TwoSum primitive is never contracted.
import { R, F, U, add, sub, mul, neg, ONE, fromBits, fromNumber, toBits, toNumber, hex, isExactSum } from './exact.js';

export const MODELS = Object.freeze({
  F: Object.freeze({ name: 'F', fma: F }),
  U: Object.freeze({ name: 'U', fma: U }),
  S: Object.freeze({ name: 'S', fma: F, contractS: true }),
  DB: Object.freeze({ name: 'DB', fma: F, contractDb: true }),
  SDB: Object.freeze({ name: 'SDB', fma: F, contractS: true, contractDb: true }),
});
export const NEGATIVE_CONTROLS = Object.freeze(['U', 'S', 'DB', 'SDB']);

// Under Model F every primitive must recover its exact residual on the validation vectors and trajectories (the §2.3 range assumptions).
export const EXACTNESS = { checked: 0, failed: 0 };
const checkExact = (model, high, low, exact) => { if (model.name !== 'F') return; EXACTNESS.checked++; if (!isExactSum(high, low, exact)) EXACTNESS.failed++; };

export function twoProductFMA(a, b, model) {          // p = R(a*b); e = F(a, b, -p)
  const p = R(mul(a, b)), e = model.fma(a, b, neg(p));
  checkExact(model, p, e, mul(a, b));
  return [p, e];
}
export function twoSum(a, b) {                          // the six-operation TwoSum, every operation rounded
  const s = R(add(a, b)), v = R(sub(s, a)), aa = R(sub(s, v)), da = R(sub(a, aa)), db = R(sub(b, v)), e = R(add(da, db));
  return [s, e];
}
export function compDot(xs, ys, model) {
  let [p, s] = twoProductFMA(xs[0], ys[0], model);
  for (let i = 1; i < xs.length; i++) {
    const [h, r] = twoProductFMA(xs[i], ys[i], model);
    // TwoSum(p, h), with the S/DB contractions applied to its product-fed operations only
    const sum = model.contractS ? F(xs[i], ys[i], p) : R(add(p, h));
    const v = R(sub(sum, p)), aa = R(sub(sum, v)), da = R(sub(p, aa));
    const db = model.contractDb ? F(xs[i], ys[i], neg(v)) : R(sub(h, v));
    const q = R(add(da, db));
    if (!model.contractS && !model.contractDb) checkExact(model, sum, q, add(p, h));
    p = sum;
    const t = R(add(q, r));
    s = R(add(s, t));
  }
  return R(add(p, s));
}
// One quaternion update from the old state: the four ordered operand pairs of §2.2 (parameter inside the compensated sum).
export function update(q, C, model) {
  const [a, b, c, d] = q;
  return [
    compDot([a, neg(b), neg(c), neg(d), C[0]], [a, b, c, d, ONE], model),
    compDot([a, b, C[1]], [b, a, ONE], model),
    compDot([a, c, C[2]], [c, a, ONE], model),
    compDot([a, d, C[3]], [d, a, ONE], model),
  ];
}
// Independent reference: each component of the exact polynomial rounded once (no compensation graph).
export function crUpdate(q, C) {
  const [a, b, c, d] = q, two = fromBits(0x40000000);
  return [R(add(sub(sub(sub(mul(a, a), mul(b, b)), mul(c, c)), mul(d, d)), C[0])),
    R(add(mul(two, mul(a, b)), C[1])), R(add(mul(two, mul(a, c)), C[2])), R(add(mul(two, mul(a, d)), C[3]))];
}

const effective = x => { const f = Math.fround(x); return fromNumber(f); };
// The frozen off-plane orbit under one model: eight iterates as hex words, and the frozen-tolerance maximum (iterate is 1-based).
export function offplaneOrbit(fx, model, step = (q, C) => update(q, C, model)) {
  const { q: q0, C: c0, orbit } = fx.arithmetic.offplane, { absoluteTolerance: abs, relativeTolerance: rel, iterations } = fx.arithmeticProtocol.offplane;
  let q = q0.map(effective); const C = c0.map(effective), rows = [], words = [];
  let maxRatio = { ratio: 0, iterate: 0, component: 0 };
  for (let n = 0; n < iterations; n++) {
    q = step(q, C);
    rows.push(q.map(v => hex(toBits(v)))); words.push(...q.map(toBits));
    q.forEach((v, k) => { const ref = orbit[n][k], ratio = Math.abs(toNumber(v) - ref) / (abs + rel * Math.abs(ref)); if (ratio > maxRatio.ratio) maxRatio = { ratio, iterate: n + 1, component: k }; });
  }
  return { rows, words, maxRatio };
}
export const rowsText = rows => rows.map(r => r.join(' ')).join('\n') + '\n';

// §2.6 item 3: xorshift32 from 0x504f3035; each word keeps its sign and low 23 fraction bits, exponent field 125 + ((w >>> 23) & 3).
export function generalCases(count = 1024, seed = 0x504f3035) {
  let state = seed >>> 0;
  const next = () => { state = (state ^ (state << 13)) >>> 0; state = (state ^ (state >>> 17)) >>> 0; state = (state ^ (state << 5)) >>> 0; return state; };
  const word = w => ((w & 0x80000000) | ((125 + ((w >>> 23) & 3)) << 23) | (w & 0x7fffff)) >>> 0;
  return Array.from({ length: count }, () => { const v = Array.from({ length: 8 }, () => fromBits(word(next()))); return { q: v.slice(0, 4), C: v.slice(4) }; });
}

// §2.6 item 1: V = {0} ∪ {±2^e(1 + k·2^-23)}, e ∈ {-20, 0, 20}, k ∈ {0, 1, 0x3fffff, 0x400000, 0x7ffffe, 0x7fffff}; all ordered pairs.
export const GRID_E = Object.freeze([-20, 0, 20]), GRID_K = Object.freeze([0, 1, 0x3fffff, 0x400000, 0x7ffffe, 0x7fffff]);
export function primitiveGrid() {
  const values = [fromBits(0)];
  for (const e of GRID_E) for (const k of GRID_K) for (const sign of [0, 1]) values.push(fromBits(((sign << 31) | ((e + 127) << 23) | k) >>> 0));
  const pairs = [];
  for (const a of values) for (const b of values) pairs.push([a, b]);
  return { values, pairs };
}

// §2.6 item 2: the discriminating witnesses (bit patterns), and the zero-based indices of the product-fed quaternion witnesses.
export const WITNESSES = Object.freeze({
  product: Object.freeze({ a: 0x3f800001, b: 0x3f7fffff, p: 0x3f800000, e: 0x337ffffe }),
  twoSum: Object.freeze({ a: 0x3f800000, b: 0x33800000, s: 0x3f800000, e: 0x33800000 }),
  dot: Object.freeze({ x: Object.freeze([0x3f800001, 0xbf800000]), y: Object.freeze([0x3f7fffff, 0x3f800000]), result: 0x337ffffe }),
  S: Object.freeze({ index: 26 }),
  DB: Object.freeze({ index: 1 }),
});
