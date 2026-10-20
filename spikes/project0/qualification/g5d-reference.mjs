// spikes/project0/qualification/g5d-reference.mjs — the G5-D independent reference (prereg §4): the binary64 operational orbit, the certified
// binary32 escape radius and the sensitivity screen. It never calls a candidate binary32 model (g5d-models.mjs); exact dyadic arithmetic
// (remediation/exact.js, reused without change) is used only to certify the radius inequality.
import { nextUp, nextDown } from '../reference/f32.js';
import { fromNumber, add, sub, mul, compare, ZERO, ONE } from '../remediation/exact.js';

export const BUDGET = 128;
// The unchanged tolerances (fixtures.json arithmeticProtocol: offplane absolute/relative, plane logR; sensitivityFraction).
export const TOLERANCES = Object.freeze({ absolute: 1e-6, relative: 1e-5, logR: 1e-5, fraction: 0.25 });
export const componentTolerance = r => TOLERANCES.absolute + TOLERANCES.relative * Math.abs(r);

// §4.1: each step reads the complete old state; ordinary JavaScript operation order.
export function step(q, C) {
  const [a, b, c, d] = q;
  return [
    a * a - b * b - c * c - d * d + C[0],
    a * b + b * a + C[1],
    a * c + c * a + C[2],
    a * d + d * a + C[3],
  ];
}

// §4.3: escape is |q_n| > R (strict), tested at n = 0 and after each update n = 1..budget. rows holds the updates only (not q0); an initial
// escape has no rows; a budget result has `budget` rows and null e and log.
export function orbit(q0, C, R, budget = BUDGET) {
  let q = [...q0];
  const rows = [], n0 = Math.hypot(...q);
  if (n0 > R) return { e: 0, rows, log: Math.log(n0) };
  for (let n = 1; n <= budget; n++) {
    q = step(q, C);
    if (!q.every(Number.isFinite)) throw new RangeError('nonfinite binary64 reference state');
    rows.push(q);
    const h = Math.hypot(...q);
    if (h > R) return { e: n, rows, log: Math.log(h) };
  }
  return { e: null, rows, log: null };
}

// §4.2: R certifies C when R >= 2 and R^2 (R - 1)^2 >= sum C_j^2, decided exactly over the binary32 values.
export function certifies(R, C) {
  if (!(R >= 2) || Math.fround(R) !== R) return false;
  let s = ZERO;
  for (const c of C) { const x = fromNumber(Math.fround(c)); s = add(s, mul(x, x)); }
  const r = fromNumber(R), r1 = sub(r, ONE);
  return compare(mul(mul(r, r), mul(r1, r1)), s) >= 0;
}
// The least binary32 R >= 2 that certifies C: a binary64 estimate rounded to binary32, nextUp until certified, then down while the preceding
// value is still >= 2 and certified.
export function certifiedRadius(C) {
  const n = Math.hypot(...C);
  let R = Math.fround(Math.max(2, (1 + Math.sqrt(1 + 4 * n)) / 2));
  if (R < 2) R = 2;
  while (!certifies(R, C)) R = nextUp(R);
  while (R > 2) { const p = nextDown(R); if (p >= 2 && certifies(p, C)) R = p; else break; }
  return R;
}

export const band = e => (e === null ? 'SB' : e <= 3 ? 'S0' : e <= 7 ? 'S1' : e <= 31 ? 'S2' : 'S3');
// §5.2: some compared reference iterate with a^2 >= 1/4, b^2+c^2+d^2 >= 1/4 and |a^2 - (b^2+c^2+d^2)| <= 2^-8 max(...)
export const isCancellation = ref => ref.rows.some(([a, b, c, d]) => { const A = a * a, V = b * b + c * c + d * d; return A >= 0.25 && V >= 0.25 && Math.abs(A - V) <= 2 ** -8 * Math.max(A, V); });

// §4.5: nextDown then nextUp of each of the eight effective inputs in order (q.real, q.i, q.j, q.k, C.real, C.i, C.j, C.k), at the
// unperturbed certified R. Reasons, in order: status/index; component (common update rows, > a quarter of the component tolerance against
// the unperturbed reference); logR (whenever both escape, regardless of index, > a quarter of its tolerance). `full` records every
// neighbour; otherwise the first reason ends the screen (the generator's streaming pass). `orbit` is injectable for tests.
export function screen(inputs, R, ref, { full = true, orbit: run = orbit } = {}) {
  const reasons = [], f = TOLERANCES.fraction;
  for (let k = 0; k < 8; k++) for (const [direction, move] of [['down', nextDown], ['up', nextUp]]) {
    const v = [...inputs]; v[k] = move(v[k]);
    const o = run(v.slice(0, 4), v.slice(4), R), changed = [];
    if (o.e !== ref.e) changed.push('status/index');
    const L = Math.min(o.rows.length, ref.rows.length);
    let comp = false;
    for (let n = 0; n < L && !comp; n++) for (let i = 0; i < 4; i++) { const r = ref.rows[n][i]; if (Math.abs(o.rows[n][i] - r) > f * componentTolerance(r)) { comp = true; break; } }
    if (comp) changed.push('component');
    if (o.e !== null && ref.e !== null && Math.abs(o.log - ref.log) > f * TOLERANCES.logR * Math.abs(ref.log)) changed.push('logR');
    if (changed.length) { reasons.push({ coordinate: k, direction, changed }); if (!full) return { eligible: false, reasons }; }
  }
  return { eligible: reasons.length === 0, reasons };
}
