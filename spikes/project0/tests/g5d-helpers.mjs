// spikes/project0/tests/g5d-helpers.mjs — shared G5-D test fixtures (not a test file). GPU-shaped readbacks are built here, independently of
// the read-time decoder, from the exact models' binary32 orbits and the kernel's documented layout: per sample one header vec4u (status code in
// ARITH_STATUS order, escape or failure index, log-radius word, completed-update count), then one row per completed update, in frozen batches.
import { readFileSync } from 'node:fs';

const imp = p => import(p).catch(() => ({}));
const Md = await imp('../qualification/g5d-models.mjs');
const Mt = await imp('../qualification/g5d-metrics.mjs');
const Cf = await imp('../qualification/g5d-config.js');
export const fx = JSON.parse(readFileSync(new URL('../fixtures.json', import.meta.url), 'utf8'));
export const MATRIX_SHA256 = 'b74ecc9e404ace915fe59fd7e4ea0acb097743157e376bff2edf45f19663c96e';
export const word = x => { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, x); return b.getUint32(0).toString(16).padStart(8, '0'); };
export const val = h => { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, parseInt(h, 16)); return b.getFloat32(0); };
export const committedMatrix = () => JSON.parse(readFileSync(new URL('../qualification/g5d-matrix.json', import.meta.url), 'utf8'));

// mutate(case, result) may return a replacement {status, e, rows (hex words), log}
export function gpuRaw(matrix, model, { mutate = null } = {}) {
  const L = Cf.OPERATIONAL_LAYOUT, rows = [];
  for (const c of matrix.cases) {
    const q0 = c.inputWords.slice(0, 4).map(val), C = c.inputWords.slice(4).map(val), R = val(c.radiusWord);
    let r = Md.runModel(Md.STEPS[model], q0, C, R, { budget: L.budget });
    if (mutate) r = mutate(c, r) ?? r;
    const header = r.status === 'escaped' ? [0, r.e, parseInt(word(Math.fround(r.log)), 16), r.rows.length] : r.status === 'budget' ? [1, 0, 0, r.rows.length] : [2, r.e, 0, r.rows.length];
    const body = r.rows.flatMap(row => row.map(h => parseInt(h, 16)));
    rows.push([...header, ...body, ...Array(4 * (L.stride - 1 - r.rows.length)).fill(0)]);
  }
  const batches = [];
  for (let start = 0; start < rows.length; start += L.batch) { const count = Math.min(L.batch, rows.length - start); batches.push({ start, count, words: rows.slice(start, start + count).flat() }); }
  const cont = Md.runModel(Md.STEPS[model], fx.arithmetic.offplane.q.map(Math.fround), fx.arithmetic.offplane.C.map(Math.fround), 0, { budget: 8, force: true });
  return { form: Cf.G5D_FORM, profile: Cf.G5D_PROFILE_ID, layout: { ...L }, shader: Mt.expectedG5dShader(), matrix: { sha256: MATRIX_SHA256, cases: matrix.cases.length },
    continuation: { words: cont.rows.flatMap(row => row.map(h => parseInt(h, 16))) }, batches };
}

// The plane slot's words, built from the frozen reference (what a correct GPU reports): status code, index, log word, 0.
export function planeWords(fixtures = fx) {
  return fixtures.arithmetic.plane.flatMap(s => {
    const r = s.reference;
    return r.status === 'escaped' ? [0, r.index, parseInt(word(Math.fround(r.logR)), 16), 0] : r.status === 'budget' ? [1, 0, 0, 0] : [2, 1, 0, 0];
  });
}
