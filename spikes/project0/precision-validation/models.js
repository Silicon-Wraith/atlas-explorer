// spikes/project0/precision-validation/models.js — T12 fix round 1 (Codex T12 r1, finding 1; preregistered in
// docs/reports/project0/t12-validation-prereg.md). Pure: shared by the corpus generator, the Node interpretation (measure/precision.mjs) and
// the negative-control tests. No browser or GPU.
// - f32 models of compensated.wgsl's float-float functions, statement by statement (binary64 then Math.fround is correctly rounded binary32 for
//   one +, - or x of binary32 operands), with fault variants that model compiler elimination: a zeroed TwoSum residual, a zeroed TwoProduct
//   residual, and an identity split (unfused, so the Dekker residual recomputes to zero).
// - checkSupplement: the supplemental primitive cases, judged by exact value (hi + lo as a dyadic rational), never by low-word bits, so a
//   legitimate fused residual is accepted.
// - checkCaptures: the operand/result captures written inside trace_ff_list at its three arithmetic site classes, each checked against the
//   exact result with a preregistered error bound, and counted as discriminating where plain binary32 arithmetic would exceed that bound.
import { fromNumber, add, sub, mul, compare, F, toNumber } from '../remediation/exact.js';

const f = Math.fround;
// 'contracted' is a legitimate compilation: every multiply feeding an add or subtract is fused (one rounding), as WGSL permits. It must pass.
export const VARIANTS = Object.freeze(['correct', 'contracted', 'twoSumResidualZero', 'twoProductResidualZero', 'splitIdentity']);
const fma = (a, b, c) => toNumber(F(fromNumber(f(a)), fromNumber(f(b)), fromNumber(f(c))));
export function ffModel(variant = 'correct') {
  if (!VARIANTS.includes(variant)) throw new Error(`unknown model variant ${variant}`);
  const two_sum = (a, b) => { const s = f(a + b); const bb = f(s - a); return [s, variant === 'twoSumResidualZero' ? 0 : f(f(a - f(s - bb)) + f(b - bb))]; };
  const quick_two_sum = (a, b) => { const s = f(a + b); return [s, f(b - f(s - a))]; };
  const split = a => { if (variant === 'splitIdentity') return [a, 0]; const t = f(4097 * a); const hi = f(t - f(t - a)); return [hi, f(a - hi)]; };
  const two_prod = (a, b) => {
    const p = f(a * b), x = split(a), y = split(b);
    if (variant === 'twoProductResidualZero') return [p, 0];
    if (variant === 'contracted') return [p, fma(x[1], y[1], fma(x[1], y[0], fma(x[0], y[1], fma(x[0], y[0], -p))))];
    return [p, f(f(f(f(f(x[0] * y[0]) - p) + f(x[0] * y[1])) + f(x[1] * y[0])) + f(x[1] * y[1]))];
  };
  const add_ff = (a, b) => { const s = two_sum(a[0], b[0]), t = two_sum(a[1], b[1]); const u = quick_two_sum(s[0], f(s[1] + t[0])); return quick_two_sum(u[0], f(u[1] + t[1])); };
  const mul_ff_f32 = (a, b) => { const p = two_prod(a[0], b); return quick_two_sum(p[0], variant === 'contracted' ? fma(a[1], b, p[1]) : f(p[1] + f(a[1] * b))); };
  return { two_sum, quick_two_sum, split, two_prod, add_ff, mul_ff_f32 };
}

const pair = v => (Array.isArray(v) ? v.map(f) : [f(v), 0]);
// The `primitives` entry point: op 0 two_sum(a.hi, b.hi), 1 add_ff(a, b), 2 mul_ff_f32(a, b.hi); the produced pair feeds add_ff(r, then).
export function primitiveCase(c, variant = 'correct') {
  const m = ffModel(variant), a = pair(c.args[0]), b = pair(c.args[1]), then = c.thenAdd ? pair(c.thenAdd) : [0, 0];
  const r = c.op === 'two_sum' ? m.two_sum(a[0], b[0]) : c.op === 'add_ff' ? m.add_ff(a, b) : c.op === 'mul_ff_f32' ? m.mul_ff_f32(a, b[0]) : null;
  if (!r) throw new Error(`unknown primitive op ${c.op}`);
  const t = m.add_ff(r, then);
  return { hi: r[0], lo: r[1], thenHi: t[0], thenLo: t[1] };
}

// binary32 words as 8-digit hex (the corpus format) and back.
const view = new DataView(new ArrayBuffer(4));
export const word = x => { view.setFloat32(0, x); return view.getUint32(0).toString(16).padStart(8, '0'); };
export const value = h => { view.setUint32(0, parseInt(h, 16)); return view.getFloat32(0); };
const X = x => fromNumber(f(x) === 0 ? 0 : f(x));                    // ±0 compare equal
const pairValue = (hi, lo) => add(X(hi), X(lo));

// The supplemental primitive cases (corpus.primitives, in order), against the page's {hi, lo, thenHi, thenLo} results. Malformed evidence throws;
// a wrong value is a validation failure.
export function checkSupplement(results, corpus) {
  const cases = corpus.primitives;
  if (!Array.isArray(results) || results.length !== cases.length) throw new Error(`expected one result per supplemental primitive case (${cases.length})`);
  const failures = [];
  results.forEach((got, i) => {
    for (const k of ['hi', 'lo', 'thenHi', 'thenLo']) if (typeof got?.[k] !== 'number' || !Number.isFinite(got[k]) || f(got[k]) !== got[k]) throw new Error(`supplemental case ${i}: ${k} must be a finite binary32 value`);
    const e = cases[i].expected, c = cases[i];
    if (compare(pairValue(got.hi, got.lo), pairValue(value(e.hi), value(e.lo))) !== 0) failures.push(`supplement ${i} ${c.op}(${JSON.stringify(c.args)}): got ${got.hi} + ${got.lo}`);
    if (compare(pairValue(got.thenHi, got.thenLo), pairValue(value(e.thenHi), value(e.thenLo))) !== 0) failures.push(`supplement ${i} ${c.op}: the low component was not retained (then ${got.thenHi} + ${got.thenLo})`);
  });
  return failures;
}

// Captures (compensated.wgsl trace_ff_list): for ray i < rays and step s < steps, four vec4f rows at (i * steps + s) * 4:
//   row 0 (t.hi, t.lo, inc, flag): flag 1 = evaluated and stepped by inc = prof.k * de; 2 = evaluated, ray ended; 0 = not reached;
//   rows 1-3 (prod.hi, prod.lo, p.hi, p.lo) for components x, y, z: prod = mul_ff_f32(t, d_k), p = add_ff(origin_ff[k], prod).
// Site classes: mul (prod against (t.hi + t.lo) * d_k), addOrigin (p against origin_k + prod), addT (the next step's t against t + inc).
export const SITES = Object.freeze(['mul', 'addOrigin', 'addT']);
const abs = a => (a.m < 0n ? { m: -a.m, e: a.e } : a);
const scaled = (a, e) => ({ m: a.m, e: a.e + e });
const within = (err, scale, cfg) => compare(err, scaled(scale, cfg.relativeBoundExponent)) <= 0 || compare(err, { m: 1n, e: cfg.absoluteFloorExponent }) <= 0;

export function checkCaptures(words, set, cfg) {
  const { rays, steps } = cfg, n = Math.min(rays, set.rows.length);
  if (!Array.isArray(words) || words.length !== rays * steps * 16 || !words.every(w => Number.isInteger(w) && w >= 0 && w <= 0xffffffff)) throw new Error(`capture: expected ${rays * steps * 16} words for ${rays} rays x ${steps} steps`);
  const fl = new Float32Array(Uint32Array.from(words).buffer);
  const row = (r, s, k) => Array.from(fl.subarray(((r * steps + s) * 4 + k) * 4, ((r * steps + s) * 4 + k) * 4 + 4));
  const origin = set.originPairs.map(p => [f(p[0]), f(p[1])]);
  const checked = { mul: 0, addOrigin: 0, addT: 0 }, discriminating = { mul: 0, addOrigin: 0, addT: 0 }, failures = [];
  const judge = (site, label, result, exact, scale, plain) => {
    checked[site]++;
    if (!within(abs(sub(result, exact)), scale, cfg)) failures.push(`${label}: ${site} error exceeds 2^${cfg.relativeBoundExponent} of its scale`);
    if (!within(abs(sub(plain, exact)), scale, cfg)) discriminating[site]++;
  };
  for (let r = 0; r < rays; r++) {
    let ended = false, prev = null;
    for (let s = 0; s < steps; s++) {
      const [tx, ty, inc, flag] = row(r, s, 0), label = `distance ${set.distance} ray ${r} step ${s}`;
      if (![0, 1, 2].includes(flag)) throw new Error(`capture ${label}: flag ${flag} is not 0, 1 or 2`);
      if (r >= n && flag !== 0) throw new Error(`capture ${label}: a ray beyond the set was captured`);
      if (flag === 0) { ended = true; prev = null; continue; }
      if (ended) throw new Error(`capture ${label}: a captured step follows an uncaptured one`);
      const vals = [tx, ty, inc, ...[1, 2, 3].flatMap(k => row(r, s, k))];
      if (!vals.every(Number.isFinite)) throw new Error(`capture ${label}: non-finite capture`);
      if (flag === 2 && inc !== 0) throw new Error(`capture ${label}: an ended step carries an increment`);
      const t = pairValue(tx, ty);
      if (prev) judge('addT', `${label} (t update)`, t, add(prev.t, X(prev.inc)), add(abs(prev.t), abs(X(prev.inc))), X(f(prev.tx + prev.inc)));
      for (let k = 0; k < 3; k++) {
        const [ph, pl, sh, sl] = row(r, s, k + 1), d = X(set.rows[r].effectiveDirection[k]);
        const prod = pairValue(ph, pl), o = pairValue(origin[k][0], origin[k][1]);
        judge('mul', `${label} component ${k}`, prod, mul(t, d), abs(mul(t, d)), X(f(tx * f(set.rows[r].effectiveDirection[k]))));
        judge('addOrigin', `${label} component ${k}`, pairValue(sh, sl), add(o, prod), add(abs(o), abs(prod)), X(f(origin[k][0] + ph)));
      }
      prev = flag === 1 ? { t, tx, inc } : null;
      if (flag === 2) ended = true;
    }
  }
  return { checked, discriminating, failures };
}

// The per-site discrimination minimum over all captured sets: a capture that cannot detect elimination proves nothing.
export function captureVerdict(results, cfg) {
  const checked = { mul: 0, addOrigin: 0, addT: 0 }, discriminating = { mul: 0, addOrigin: 0, addT: 0 }, failures = [];
  for (const r of results) { for (const s of SITES) { checked[s] += r.checked[s]; discriminating[s] += r.discriminating[s]; } failures.push(...r.failures); }
  const short = SITES.filter(s => discriminating[s] < cfg.minimumDiscriminating[s]);
  return { checked, discriminating, minimum: { ...cfg.minimumDiscriminating }, failures: failures.slice(0, 20), failureCount: failures.length,
    insufficient: short.map(s => `captures: ${discriminating[s]} discriminating ${s} sites, fewer than the preregistered ${cfg.minimumDiscriminating[s]}`) };
}

// Synthetic captures from a model variant, laid out exactly as trace_ff_list writes them (tests and negative controls; never evidence).
export function synthesizeCaptures(set, cfg, variant = 'correct', { t0 = 0.05, inc = (r, s) => 0.002 + 0.000137 * (s + 1) * (r + 1), stepsOf = () => cfg.steps } = {}) {
  const m = ffModel(variant), fl = new Float32Array(cfg.rays * cfg.steps * 16), origin = set.originPairs.map(p => [f(p[0]), f(p[1])]);
  for (let r = 0; r < Math.min(cfg.rays, set.rows.length); r++) {
    let t = [f(t0 + 0.0001 * r), 0];
    const last = Math.min(stepsOf(r), cfg.steps);
    for (let s = 0; s < last; s++) {
      const base = (r * cfg.steps + s) * 16;
      for (let k = 0; k < 3; k++) { const prod = m.mul_ff_f32(t, f(set.rows[r].effectiveDirection[k])), p = m.add_ff(origin[k], prod); fl.set([prod[0], prod[1], p[0], p[1]], base + 4 * (k + 1)); }
      if (s === last - 1 && last < cfg.steps) { fl.set([t[0], t[1], 0, 2], base); break; }
      const i = f(inc(r, s)); fl.set([t[0], t[1], i, 1], base); t = m.add_ff(t, [i, 0]);
    }
  }
  return Array.from(new Uint32Array(fl.buffer));
}
