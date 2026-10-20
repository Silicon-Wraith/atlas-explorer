// spikes/project0/qualification/g5d-models.mjs — node spikes/project0/qualification/g5d-models.mjs --check | --write
// The four exact G5-D CPU models (prereg §6.1: U unfused source order, F the E2 contraction graph, A a fixed reassociated graph, Q correctly
// rounded per component), built on the exact dyadic primitives of remediation/exact.js (reused without change), and the §6 predictions:
// operational (all 287 samples), plane (4,096 frozen inputs) and forced continuation (eight updates of the frozen off-plane input). Each model
// keeps binary32 state; its escape test and log-radius use binary64 Math.hypot / Math.log of that state, which are explicitly NOT bit
// predictions of WGSL length() and log(). Agreement with a model is diagnostic only; predictions never change eligibility.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { canonical } from '../contract.js';
import { R, F, add, sub, mul, neg, fromNumber, toNumber, toBits, hex, RANGE } from '../remediation/exact.js';
import { componentTolerance, TOLERANCES } from './g5d-reference.mjs';

export const MODEL_NAMES = Object.freeze(['U', 'F', 'A', 'Q']);
export const PREDICTIONS_URL = new URL('./g5d-predictions.json', import.meta.url);
const sha = s => createHash('sha256').update(s).digest('hex');
const TWO = fromNumber(2);
const t2 = a => R(mul(TWO, a));

// Every component reads the old state q = (a, b, c, d); t = R(2a).
export const STEPS = Object.freeze({
  U: (q, C) => { const [a, b, c, d] = q, t = t2(a);
    return [R(add(R(sub(R(sub(R(sub(R(mul(a, a)), R(mul(b, b)))), R(mul(c, c)))), R(mul(d, d)))), C[0])), ...[b, c, d].map((v, i) => R(add(R(mul(t, v)), C[i + 1])))]; },
  F: (q, C) => { const [a, b, c, d] = q, t = t2(a);
    let r = F(a, a, neg(R(mul(b, b)))); r = F(neg(c), c, r); r = F(neg(d), d, r);
    return [R(add(r, C[0])), ...[b, c, d].map((v, i) => F(t, v, C[i + 1]))]; },
  A: (q, C) => { const [a, b, c, d] = q, t = t2(a), s = R(add(R(add(R(mul(b, b)), R(mul(c, c)))), R(mul(d, d))));
    return [R(add(F(a, a, neg(s)), C[0])), ...[b, c, d].map((v, i) => F(t, v, C[i + 1]))]; },
  Q: (q, C) => { const [a, b, c, d] = q;
    return [R(add(sub(sub(sub(mul(a, a), mul(b, b)), mul(c, c)), mul(d, d)), C[0])), ...[b, c, d].map((v, i) => R(add(mul(mul(TWO, a), v), C[i + 1])))]; },
});

const num = q => q.map(toNumber);
const hexRow = q => q.map(v => hex(toBits(v)));                          // exact.js ZERO carries no sign: ±0 is normalised to 00000000
// One model orbit from binary32 inputs (JS numbers). Rows are the updates as lowercase hex words. `force` runs `budget` updates ignoring escape.
export function runModel(step, q0, C0, radius, { budget = 128, force = false } = {}) {
  let q = q0.map(fromNumber);
  const C = C0.map(fromNumber), rows = [];
  const h0 = Math.hypot(...num(q));
  if (!force && h0 > radius) return { status: 'escaped', e: 0, rows, log: Math.log(h0) };
  for (let n = 1; n <= budget; n++) {
    q = step(q, C); rows.push(hexRow(q));
    if (force) continue;
    const h = Math.hypot(...num(q));
    if (h > radius) return { status: 'escaped', e: n, rows, log: Math.log(h) };
  }
  return force ? { status: 'forced', e: null, rows, log: null } : { status: 'budget', e: null, rows, log: null };
}

// §6.3 framing: "<ID> <escaped|budget> <index|-> <rows>\n" then each row's four words, LF-terminated; no separator between cases.
export const frame = (id, r) => `${id} ${r.e === null ? 'budget' : 'escaped'} ${r.e === null ? '-' : r.e} ${r.rows.length}\n` + r.rows.map(row => row.join(' ') + '\n').join('');
const f32Of = h => { const u = new Uint32Array([parseInt(h, 16)]); return new Float32Array(u.buffer)[0]; };

function operational(matrix, step) {
  let text = '', maxC = 0, maxL = 0, pass = 0, statusIndex = 0, failures = 0, s3Out = 0, s3Idx = 0;
  const cases = {};
  for (const c of matrix.cases) {
    const v = c.inputWords.map(f32Of), r = runModel(step, v.slice(0, 4), v.slice(4), f32Of(c.radiusWord), { budget: matrix.budget }), t = frame(c.id, r);
    text += t;
    cases[c.id] = { status: r.status, e: r.e, rows: r.rows.length, log: r.log, sha256: sha(t) };
    const ref = c.reference, idxOk = r.e === ref.e, L = Math.min(r.rows.length, ref.rows.length);
    let cr = 0;
    for (let n = 0; n < L; n++) for (let i = 0; i < 4; i++) { const x = ref.rows[n][i]; cr = Math.max(cr, Math.abs(f32Of(r.rows[n][i]) - x) / componentTolerance(x)); }
    const lr = idxOk && ref.e !== null ? Math.abs(r.log - ref.log) / (TOLERANCES.logR * Math.abs(ref.log)) : 0;
    if (c.role === 'qualifying') {
      if (!idxOk) statusIndex++; else if (cr > 1 || lr > 1) failures++;
      if (idxOk && cr <= 1 && lr <= 1) pass++;
      maxC = Math.max(maxC, cr); maxL = Math.max(maxL, lr);
    } else { if (!idxOk) s3Idx++; if (!idxOk || cr > 1 || lr > 1) s3Out++; }
  }
  return { sha256: sha(text), summary: { qualifyingPass: pass, qualifyingStatusIndex: statusIndex, qualifyingFailures: failures, maxComponentRatio: maxC, maxLogRRatio: maxL, s3Outside: s3Out, s3StatusIndex: s3Idx }, cases };
}

function plane(fx, step) {
  let text = '', statusIndex = 0, failures = 0, maxL = 0;
  const { iterations, tolerances } = fx.arithmeticProtocol.plane, cases = [];
  fx.arithmetic.plane.forEach((p, k) => {
    const [x, y, cr, ci] = p.input.map(Math.fround), r = runModel(step, [x, y, 0, 0], [cr, ci, 0, 0], 2, { budget: iterations });
    text += frame(`P${String(k).padStart(4, '0')}`, r);
    cases.push([r.e === null ? 'budget' : 'escaped', r.e, r.log]);
    if (!p.eligible) return;
    const re = p.reference, ok = re.status === 'budget' ? r.e === null : r.e === re.index;
    if (!ok) { statusIndex++; return; }
    if (re.status === 'escaped') { const l = Math.abs(r.log - re.logR) / (tolerances.logR * Math.abs(re.logR)); maxL = Math.max(maxL, l); if (l > 1) failures++; }
  });
  return { sha256: sha(text), summary: { eligibleStatusIndex: statusIndex, eligibleFailures: failures, maxEligibleLogRRatio: maxL }, cases };
}

function continuation(fx, step) {
  const { q, C, orbit } = fx.arithmetic.offplane, { iterations } = fx.arithmeticProtocol.offplane;
  const r = runModel(step, q.map(Math.fround), C.map(Math.fround), 0, { budget: iterations, force: true });
  let ratio = 0;
  r.rows.forEach((row, n) => row.forEach((h, i) => { const x = orbit[n][i]; ratio = Math.max(ratio, Math.abs(f32Of(h) - x) / componentTolerance(x)); }));
  return { sha256: sha(r.rows.map(row => row.join(' ') + '\n').join('')), componentRatio: ratio, rows: r.rows.map(row => row.join(' ')) };
}

export function buildPredictions(matrix, fx) {
  const models = {};
  RANGE.subnormalOrUnderflow = 0;
  let overflow = 0;
  for (const name of MODEL_NAMES) {
    try { models[name] = { operational: operational(matrix, STEPS[name]), plane: plane(fx, STEPS[name]), continuation: continuation(fx, STEPS[name]) }; }
    catch (e) { if (/overflow/.test(e.message)) overflow++; throw e; }
  }
  return { schema: 1, id: 'project0-g5d-v1', matrixSha256: sha(canonical(matrix) + '\n'), models, range: { subnormalOrUnderflow: RANGE.subnormalOrUnderflow, overflow },
    note: 'Model norms and log-radii are binary64 Math.hypot / Math.log of the binary32 state: not bit predictions of WGSL length() and log(). Diagnostic only.' };
}
export const serializePredictions = p => canonical(p) + '\n';

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2];
  if (!['--check', '--write'].includes(mode)) { console.error('usage: g5d-models.mjs --check | --write'); process.exit(2); }
  const fx = JSON.parse(readFileSync(new URL('../fixtures.json', import.meta.url), 'utf8'));
  const matrix = JSON.parse(readFileSync(new URL('./g5d-matrix.json', import.meta.url), 'utf8'));
  const p = buildPredictions(matrix, fx), bytes = serializePredictions(p);
  for (const n of MODEL_NAMES) { const m = p.models[n]; console.log(n, m.operational.sha256, JSON.stringify(m.operational.summary), m.plane.sha256, JSON.stringify(m.plane.summary), m.continuation.sha256, m.continuation.componentRatio); }
  console.log('range', JSON.stringify(p.range), 'predictions sha256', sha(bytes));
  if (mode === '--write') writeFileSync(PREDICTIONS_URL, bytes);
  else if (readFileSync(PREDICTIONS_URL, 'utf8') !== bytes) { console.error('g5d-predictions.json differs from the regenerated predictions'); process.exit(1); }
}
