// spikes/project0/remediation/validate.mjs — read-time validation of the G5-A compensation (prereg rev 2 §2.6–§2.7), recomputed from the
// saved raw readbacks of the G5 invocation, never from a saved flag. Acceptance of the compensation requires every primitive identity, the
// witnesses, all 1,024 updates and the actual off-plane qualification entry point's 32 words to match Model F bit for bit (±0 normalised,
// nonfinite rejected). Matching a negative control (U, S, DB, SDB) is recorded and leaves the compensation unvalidated; observations
// consistent with several models keep every match. The frozen numerical comparison is separate (measure/arith.mjs).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { R, add, mul, fromBits, toBits, isExactSum, hex } from './exact.js';
import { canonical } from '../contract.js';
import { ARITHMETIC_ENTRY_POINTS, arithmeticPipelines } from './pipeline-config.js';

export const COMPENSATED_FORM = 'g5a-compensated-dot2-prereg-rev2';
export const VALIDATION_ENTRY_POINTS = Object.freeze(['remediation_primitives', 'remediation_dot', 'remediation_updates']);
export const QUALIFICATION_ENTRY_POINTS = Object.freeze(['qjulia_plane', 'qjulia_offplane']);
const MODEL_NAMES = ['F', 'U', 'S', 'DB', 'SDB'];

let cached = null;
// The committed expectations, authenticated against the committed manifest before use.
export function supplementary() {
  if (cached) return cached;
  const text = readFileSync(new URL('./supplementary.json', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
  if (createHash('sha256').update(text).digest('hex') !== manifest.supplementary.sha256) throw new Error('remediation/supplementary.json does not match its manifest hash');
  return (cached = JSON.parse(text));
}

// Fix round 1 (finding 4): the shader identity a G5 record must report — the sha256 of the reviewed fields.wgsl + arithmetic.wgsl, exactly as
// prepare() concatenates and compiles them, and the fixed entry points and pipeline descriptors (no extra, duplicate or altered entry).
export function expectedShader() {
  const code = readFileSync(new URL('../gpu/fields.wgsl', import.meta.url), 'utf8') + readFileSync(new URL('../gpu/arithmetic.wgsl', import.meta.url), 'utf8');
  return { sha256: createHash('sha256').update(code).digest('hex'), entryPoints: [...ARITHMETIC_ENTRY_POINTS], pipelines: arithmeticPipelines() };
}
const isWord = w => typeof w === 'number' && Number.isInteger(w) && w >= 0 && w <= 0xffffffff;
const finiteWord = w => ((w >>> 23) & 0xff) !== 0xff;
const norm = w => (w === 0x80000000 ? 0 : w);                         // ±0 normalised for supplementary bit comparisons only
const hexWords = ws => ws.map(w => hex(norm(w)));

function checkedWords(name, words, length, problems) {
  if (!Array.isArray(words) || words.length !== length || !words.every(isWord)) { problems.push(`${name}: missing or malformed readback (${Array.isArray(words) ? words.length : typeof words} words, ${length} required)`); return null; }
  const nonfinite = words.filter(w => !finiteWord(w)).length;
  if (nonfinite) problems.push(`${name}: ${nonfinite} nonfinite words`);
  return words;
}

export function compensationReport(raw, fx, supp = supplementary()) {
  const problems = [], s = raw?.supplementary;
  if (raw?.form !== COMPENSATED_FORM) problems.push(`the record does not declare the compensated form (${JSON.stringify(raw?.form ?? null)})`);
  if (!s || typeof s !== 'object') return { validated: false, problems: [...problems, 'no supplementary validation evidence'], matches: [], counts: {} };
  const shader = s.shader, want = expectedShader();
  if (!shader || typeof shader !== 'object') problems.push('shader-source hash, entry points or pipeline descriptors are not recorded');
  else {
    if (shader.sha256 !== want.sha256) problems.push(`shader source hash ${JSON.stringify(shader.sha256 ?? null)} is not the reviewed fields + arithmetic source ${want.sha256}`);
    if (canonical(shader.entryPoints ?? null) !== canonical(want.entryPoints)) problems.push(`shader entry points ${JSON.stringify(shader.entryPoints ?? null)} are not the reviewed arithmetic entry points`);
    if (canonical(shader.pipelines ?? null) !== canonical(want.pipelines)) problems.push('shader pipeline descriptors differ from the reviewed arithmetic configuration (missing, duplicate, extra or altered module, layout, label or constants)');
  }
  const nPrim = supp.primitives.inputs.length, nDot = supp.dots.inputs.length, nUpd = supp.updates.inputs.length;
  const prim = checkedWords('primitives', s.primitives, 4 * nPrim, problems), dots = checkedWords('dots', s.dots, 4 * nDot, problems), upd = checkedWords('updates', s.updates, 4 * nUpd, problems);
  const orbit = checkedWords('off-plane qualification words', raw.orbitWords, 32, problems);
  if (orbit && Array.isArray(raw.orbit) && raw.orbit.length === 32) {
    const f = new Float32Array(Uint32Array.from(orbit).buffer);
    if (raw.orbit.some((v, i) => v !== f[i] && !(v === 0 && f[i] === 0))) problems.push('off-plane words and numbers disagree');
  }
  const counts = {}, partMatches = {};
  const compare = (part, got, expected) => {                           // expected[name] is an array of rows of hex words
    partMatches[part] = MODEL_NAMES.filter(name => expected[name].flat().join(' ') === hexWords(got).join(' '));
    counts[part] = { rows: expected.F.length, differingFromF: expected.F.filter((row, i) => row.join(' ') !== hexWords(got.slice(i * row.length, (i + 1) * row.length)).join(' ')).length };
    if (counts[part].differingFromF) problems.push(`${part}: ${counts[part].differingFromF} of ${counts[part].rows} differ from Model F`);
  };
  if (prim) {
    compare('primitives', prim, supp.primitives.expected);
    let identity = 0;                                                   // the independent exact oracle over the GPU's own words
    supp.primitives.inputs.forEach(([ah, bh], i) => {
      const a = fromBits(parseInt(ah, 16)), b = fromBits(parseInt(bh, 16)), w = prim.slice(4 * i, 4 * i + 4);
      if (!w.every(finiteWord)) { identity++; return; }
      const [p, e, sum, t] = w.map(x => fromBits(x));
      if (toBits(p) !== toBits(R(mul(a, b))) || !isExactSum(p, e, mul(a, b)) || toBits(sum) !== toBits(R(add(a, b))) || !isExactSum(sum, t, add(a, b))) identity++;
    });
    counts.primitiveIdentityFailures = identity;
    if (identity) problems.push(`primitives: ${identity} of ${nPrim} pairs fail the rounded-high or high + low = exact identity`);
  }
  if (dots) compare('dots', dots, Object.fromEntries(MODEL_NAMES.map(n => [n, supp.dots.expected[n].map(w => [w, '00000000', '00000000', '00000000'])])));
  if (upd) {
    compare('updates', upd, supp.updates.expected);
    counts.updatesEqualToCorrectlyRoundedPolynomial = supp.updates.exactPolynomial.filter((row, i) => row.join(' ') === hexWords(upd.slice(4 * i, 4 * i + 4)).join(' ')).length;
  }
  if (orbit) compare('offplane', orbit, Object.fromEntries(MODEL_NAMES.map(n => [n, supp.offplane.rows[n].map(r => r.split(' '))])));
  const parts = ['primitives', 'dots', 'updates', 'offplane'];
  const matches = MODEL_NAMES.filter(n => parts.every(p => partMatches[p]?.includes(n)));
  const controls = matches.filter(n => n !== 'F');
  if (controls.length) problems.push(`observations match negative control(s) ${controls.join(', ')}`);
  return { validated: problems.length === 0 && matches.includes('F'), problems, matches, partMatches, counts };
}
