// spikes/project0/measure/decode.mjs — strict readback validation. Malformed evidence throws; it is never compared.
import { ARITH_STATUS, RAY_STATUS, UNRESOLVED_REASON } from '../contract.js';

export function checkedWords(words, expectedRows) {
  if (!(Array.isArray(words) || words instanceof Uint32Array) || words.length !== 4 * expectedRows) throw new Error(`readback length mismatch: ${words?.length} words for ${expectedRows} rows`);
  for (const w of words) if (typeof w !== 'number' || !Number.isInteger(w) || w < 0 || w > 0xffffffff) throw new Error(`invalid readback word: ${w}`);
  return Uint32Array.from(words);
}

export function decodeTrace(words, expectedRows, { maxSteps }) {
  const u = checkedWords(words, expectedRows), f = new Float32Array(u.buffer), rows = [];
  for (let id = 0; id < expectedRows; id++) {
    const code = u[4 * id], reasonCode = u[4 * id + 1], t = f[4 * id + 2], steps = u[4 * id + 3];
    if (!(code < RAY_STATUS.length)) throw new Error(`row ${id}: unknown ray status code ${code}`);
    const status = RAY_STATUS[code];
    if (status === 'unresolved') { if (reasonCode !== 1 && reasonCode !== 2) throw new Error(`row ${id}: unresolved ray without a reason`); }
    else if (reasonCode !== 0) throw new Error(`row ${id}: reason on a resolved or failed ray`);
    if (steps > maxSteps) throw new Error(`row ${id}: steps out of range (${steps} > ${maxSteps})`);
    if (status !== 'miss' && !(Number.isFinite(t) && t >= 0)) throw new Error(`row ${id}: non-finite depth`);
    if (status === 'hit' && steps < 1) throw new Error(`row ${id}: hit after zero steps`);
    rows.push({ id, status, reason: status === 'unresolved' ? UNRESOLVED_REASON[reasonCode - 1] : null, t: status === 'miss' ? null : t, steps });
  }
  return rows;
}

export function decodeArith(words, expectedRows, { minIndex, cap, de }) {
  const u = checkedWords(words, expectedRows), f = new Float32Array(u.buffer), rows = [];
  for (let id = 0; id < expectedRows; id++) {
    const code = u[4 * id];
    if (!(code < ARITH_STATUS.length)) throw new Error(`row ${id}: unknown arithmetic status code ${code}`);
    const status = ARITH_STATUS[code];
    if (status === 'escaped') {
      const index = u[4 * id + 1], logR = f[4 * id + 2], d = f[4 * id + 3];
      if (index < minIndex || index > cap) throw new Error(`row ${id}: escape index out of range (${index})`);
      if (!Number.isFinite(logR) || (de && !(Number.isFinite(d) && d >= 0))) throw new Error(`row ${id}: non-finite escaped value`);
      rows.push({ id, status, index, logR, de: de ? d : null });
    } else if (status === 'budget') {
      if (u[4 * id + 1] || u[4 * id + 2] || u[4 * id + 3]) throw new Error(`row ${id}: budget result carries data`);
      rows.push({ id, status, index: null, logR: null, de: null });
    } else {
      if (u[4 * id + 1] < 1 || u[4 * id + 1] > cap) throw new Error(`row ${id}: failure index out of range`);
      rows.push({ id, status, index: null, logR: null, de: null });
    }
  }
  return rows;
}
