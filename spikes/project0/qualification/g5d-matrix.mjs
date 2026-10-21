// spikes/project0/qualification/g5d-matrix.mjs — node spikes/project0/qualification/g5d-matrix.mjs --check | --write
// The G5-D deterministic matrix generator (prereg §5) and its freshness and mutation audits. Selection uses only the independent reference
// and the unchanged sensitivity screen (g5d-reference.mjs); no candidate binary32 model is consulted. --write regenerates
// qualification/g5d-matrix.json (canonical() + LF); --check regenerates and compares the committed bytes and every preregistered hash. Never
// run during a GPU campaign.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { canonical } from '../contract.js';
import { generalCases } from '../remediation/models.js';     // the remediation's 1,024 general-update tuples (freshness only)
import { hex, toBits } from '../remediation/exact.js';
import { orbit, certifiedRadius, screen, band, isCancellation, BUDGET } from './g5d-reference.mjs';

export const SEED = 0x47354431, DRAWS = 250000;
export const MATRIX_URL = new URL('./g5d-matrix.json', import.meta.url);
// §5.6 and §5.8, as preregistered.
export const PREREGISTERED = Object.freeze({
  uniformStream: 'e5eb0b35931264f42508b7856ba872c244ddc73eacd806a0520f5bb958755823',
  neutralStream: 'ba0375e40e22131e019869e26814396b58c365b3806a1ec47d60e543526540c1',
  tuples: 'df6d9cb78cd9f159bd33491d14cf70e4e560446eb42a8040aab525d8764dcc79',
  matrix: 'b74ecc9e404ace915fe59fd7e4ea0acb097743157e376bff2edf45f19663c96e',
  prior: '4c1e21e80cbb1e07ae3d72cb4efc829cdd0e84f01392a4a982e78fc7f0629c10',
});
const sha = s => createHash('sha256').update(s).digest('hex');
const f32 = new DataView(new ArrayBuffer(4));
export const word = x => { f32.setFloat32(0, x); return f32.getUint32(0).toString(16).padStart(8, '0'); };
export const value = h => { f32.setUint32(0, parseInt(h, 16)); return f32.getFloat32(0); };
const tupleText = lines => lines.map(l => l + '\n').join('');

// §5.1
export function splitmix32(seed) {
  let state = seed;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

// §5.7: the 4,096 frozen plane tuples (j = k = 0), the frozen off-plane tuple and the remediation's 1,024 general-update tuples.
export function priorTuples(fx) {
  const prior = new Set();
  for (const p of fx.arithmetic.plane) { const [x, y, cr, ci] = p.input; prior.add([x, y, 0, 0, cr, ci, 0, 0].map(v => word(Math.fround(v))).join(' ')); }
  const o = fx.arithmetic.offplane; prior.add([...o.q, ...o.C].map(v => word(Math.fround(v))).join(' '));
  for (const g of generalCases()) prior.add([...g.q, ...g.C].map(v => hex(toBits(v))).join(' '));
  return [...prior].sort();
}

const make = (source, index, requested, R) => { const eff = requested.map(Math.fround); return { source, index, requested, eff, R, ref: orbit(eff.slice(0, 4), eff.slice(4), R) }; };

export function generateMatrix(fx) {
  const counts = {}, selected = [], lines = { uniform: [], neutral: [] };
  const count = (key, c, eligible) => { const k = (counts[key] ??= { draws: 0, eligible: 0, initial: 0 }); k.draws++; if (c.ref.e === 0) k.initial++; if (eligible && c.ref.e !== 0) k.eligible++; };
  // §5.2 uniform stream
  {
    const rnd = splitmix32(SEED), need = { S0: 64, S1: 64, S2: 32, SB: 32 }, got = { S0: 0, S1: 0, S2: 0, SB: 0, S3: 0, C: 0 };
    for (let i = 0; i < DRAWS; i++) {
      const u = Array.from({ length: 8 }, () => rnd() / 2 ** 32);
      const c = make('uniform', i, [...u.slice(0, 4).map(x => 3 * x - 1.5), ...u.slice(4).map(x => 2 * x - 1)], 2);
      if (certifiedRadius(c.eff.slice(4)) !== 2) throw new Error(`uniform draw ${i}: certified radius is not 2`);
      lines.uniform.push(c.eff.map(word).join(' '));
      const b = band(c.ref.e), s = screen(c.eff, 2, c.ref, { full: false });
      count(`uniform ${b}`, c, s.eligible);
      let pick = false;
      if (b === 'S3' && got.S3 < 32) { got.S3++; pick = true; }
      if (s.eligible && c.ref.e !== 0 && b !== 'S3' && got[b] < need[b]) { got[b]++; pick = true; }
      if (s.eligible && c.ref.e !== 0 && got.C < 16 && isCancellation(c.ref)) { got.C++; pick = true; }
      if (pick) selected.push(c);
    }
  }
  // §5.3 near-neutral diagnostic stream
  {
    const rnd = splitmix32(SEED); let s3 = 0;
    for (let i = 0; i < DRAWS; i++) {
      const U = Array.from({ length: 5 }, () => rnd() / 2 ** 32);
      const theta = 2 * Math.PI * U[0], k = 3 + (Math.floor(i / 2) % 12), sign = i % 2 === 0 ? 1 : -1, rho = 1 + sign * 2 ** (-k) * (1 + U[1]);
      const x = rho * Math.cos(theta), y = rho * Math.sin(theta), axis = [2 * U[2] - 1, 2 * U[3] - 1, 2 * U[4] - 1], norm = Math.hypot(...axis);
      if (norm === 0) throw new Error(`near-neutral draw ${i}: zero-length axis (a generator error, never a redraw)`);
      const requested = [0, 0, 0, 0, x / 2 - (x * x - y * y) / 4, ...axis.map(a => (y / 2 - 2 * x * y / 4) * a / norm)];
      const R = certifiedRadius(requested.map(Math.fround).slice(4)), c = make('neutral', i, requested, R);
      lines.neutral.push(c.eff.map(word).join(' '));
      const b = band(c.ref.e);
      count(`neutral ${b}`, c, screen(c.eff, R, c.ref, { full: false }).eligible);
      if (b === 'S3' && s3 < 32) { s3++; selected.push(c); }
    }
  }
  // §5.4 mandatory radius checks
  for (let i = 0; i < 8; i++) {
    const s = [0, 1, 2].map(j => ((i >> j) & 1 ? 1 : -1)), C = [3, s[0] / 4, s[1] / 2, 3 * s[2] / 4], R = certifiedRadius(C);
    selected.push({ ...make('radius', i, [17 / 8, s[0] / 8, s[1] / 8, s[2] / 8, ...C], R), prefix: 'R' });
    selected.push({ ...make('radius', i, [5 / 2, s[0] / 8, s[1] / 8, s[2] / 8, ...C], R), prefix: 'I' });
  }
  // §5.5 identities, full screen, roles, canonical order
  const cases = selected.map(c => {
    const id = (c.prefix ?? (c.source === 'uniform' ? 'U' : 'N')) + String(c.index).padStart(6, '0');
    const s = screen(c.eff, c.R, c.ref, { full: true }), b = band(c.ref.e);
    return { id, source: c.source, index: c.index, requested: c.requested, inputWords: c.eff.map(word), radiusWord: word(c.R), band: b, eligible: s.eligible,
      role: b !== 'S3' && c.source !== 'neutral' && s.eligible ? 'qualifying' : 'diagnostic', screen: { eligible: s.eligible, reasons: s.reasons }, reference: { e: c.ref.e, rows: c.ref.rows, log: c.ref.log } };
  }).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // §5.7 freshness: a collision is a preparation error, never permission to skip
  const prior = priorTuples(fx), priorSet = new Set(prior), tuples = cases.map(c => c.inputWords.join(' '));
  const audit = {
    streams: { uniform: sha(tupleText(lines.uniform)), neutral: sha(tupleText(lines.neutral)) }, counts,
    tuplesSha256: sha(tupleText(tuples)), duplicates: tuples.length - new Set(tuples).size,
    prior: { count: prior.length, sha256: sha(tupleText(prior)) },
    collisions: { uniform: lines.uniform.filter(l => priorSet.has(l)).length, neutral: lines.neutral.filter(l => priorSet.has(l)).length, selected: tuples.filter(l => priorSet.has(l)).length },
  };
  return { matrix: { schema: 1, id: 'project0-g5d-v1', budget: BUDGET, seed: SEED.toString(16), cases }, audit };
}

export const serializeMatrix = matrix => canonical(matrix) + '\n';

// §6.6: the qualifying matrix detects each prescribed update mutation (binary64; a sample fails on any status/index or component difference).
const MUTATIONS = {
  j0: (q, C, s) => { s[2] = 0; return s; },
  k0: (q, C, s) => { s[3] = 0; return s; },
  jk0: (q, C, s) => { s[2] = 0; s[3] = 0; return s; },
  noCjk: (q, C, s) => { s[2] -= C[2]; s[3] -= C[3]; return s; },
  signAD: (q, C, s) => { s[3] -= 2 * (2 * q[0] * q[3]); return s; },
};
export function mutationAudit(matrix) {
  const out = {};
  for (const [name, mutate] of Object.entries(MUTATIONS)) {
    let failing = 0;
    for (const c of matrix.cases.filter(x => x.role === 'qualifying')) {
      const v = c.inputWords.map(value), R = value(c.radiusWord), C = v.slice(4), rows = [];
      let q = v.slice(0, 4), e = Math.hypot(...q) > R ? 0 : null;
      for (let n = 1; n <= matrix.budget && e === null; n++) {
        const [a, b, cc, d] = q;
        q = mutate(q, C, [a * a - b * b - cc * cc - d * d + C[0], 2 * a * b + C[1], 2 * a * cc + C[2], 2 * a * d + C[3]]);
        rows.push(q); if (Math.hypot(...q) > R) e = n;
      }
      let bad = e !== c.reference.e;
      const L = Math.min(rows.length, c.reference.rows.length);
      for (let n = 0; n < L && !bad; n++) for (let i = 0; i < 4; i++) { const r = c.reference.rows[n][i]; if (Math.abs(rows[n][i] - r) > 1e-6 + 1e-5 * Math.abs(r)) { bad = true; break; } }
      if (bad) failing++;
    }
    out[name] = failing;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2];
  if (!['--check', '--write'].includes(mode)) { console.error('usage: g5d-matrix.mjs --check | --write'); process.exit(2); }
  const fx = JSON.parse(readFileSync(new URL('../fixtures.json', import.meta.url), 'utf8'));
  const { matrix, audit } = generateMatrix(fx), bytes = serializeMatrix(matrix);
  const got = { uniformStream: audit.streams.uniform, neutralStream: audit.streams.neutral, tuples: audit.tuplesSha256, matrix: sha(bytes), prior: audit.prior.sha256 };
  console.log(JSON.stringify({ ...audit, matrixSha256: got.matrix, mutations: mutationAudit(matrix) }, null, 1));
  const wrong = Object.keys(PREREGISTERED).filter(k => got[k] !== PREREGISTERED[k]);
  if (wrong.length || audit.prior.count !== 5121 || audit.duplicates || Object.values(audit.collisions).some(Boolean)) { console.error(`PREREGISTRATION MISMATCH: ${wrong.join(', ')}`); process.exit(1); }
  if (mode === '--write') writeFileSync(MATRIX_URL, bytes);
  else if (readFileSync(MATRIX_URL, 'utf8') !== bytes) { console.error('g5d-matrix.json differs from the regenerated matrix'); process.exit(1); }
  console.log(`G5-D MATRIX OK ${got.matrix}`);
}
