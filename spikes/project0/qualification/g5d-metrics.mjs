// spikes/project0/qualification/g5d-metrics.mjs — G5-D read-time decoding, validation and numerical derivation of the G5/qjulia-operational
// slot (prereg §4.3–§4.4, §7.2), recomputed from the raw words at every read. Node only.
// - The matrix, predictions and shader identity are authenticated through the registry-pinned profile (qualification/g5d-v1.json), never
//   through anything the raw record declares about itself.
// - Missing, malformed or unauthenticated evidence (shader, layout, matrix, form, batches, headers, the mandatory forced-continuation
//   diagnostic, S3 included) is an evidence defect: the derivation throws an `invalidation`, so the slot is invalid/inconclusive.
// - A well-formed numerical disagreement on a qualifying sample is a measured failure, counted in finite metrics (statusErrors, indexErrors,
//   numericalFailures); a nonfinite component or log-radius is a numerical failure, never an infinite metric. S3 samples are diagnostics
//   (E9): their disagreements are reported, never gating, and never promoted into qualification.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT } from '../launch.mjs';
import { canonical, ARITH_STATUS } from '../contract.js';
import { QUALIFICATIONS } from '../qualification.mjs';
import { G5D_FORM, G5D_PROFILE_ID, OPERATIONAL_LAYOUT } from './g5d-config.js';
import { componentTolerance, TOLERANCES } from './g5d-reference.mjs';
import { frame, MODEL_NAMES } from './g5d-models.mjs';

const sha = b => createHash('sha256').update(b).digest('hex');
const invalid = message => Object.assign(new Error(message), { invalidation: true });
const cache = new Map();
// A file bound by the profile, read and authenticated against the pinned hash (the profile itself against the registry).
function pinned(path, want, parse = true) {
  const key = `${path}@${want}`;
  if (cache.has(key)) return cache.get(key);
  const bytes = readFileSync(join(ROOT, path));
  if (sha(bytes) !== want) throw new Error(`${path} does not match its pinned hash ${want}`);
  const out = parse ? JSON.parse(bytes.toString('utf8')) : bytes;
  cache.set(key, out);
  return out;
}
export const profileDoc = () => { const e = QUALIFICATIONS[G5D_PROFILE_ID]; return pinned(e.path, e.sha256); };
export const loadMatrix = () => { const a = profileDoc().artifacts.matrix; return pinned(a.path, a.sha256); };
export const loadPredictions = () => { const a = profileDoc().artifacts.predictions; return pinned(a.path, a.sha256); };
// The reviewed G5-D shader identity: the concatenated fields.wgsl + arithmetic.wgsl hash, entry points and pipeline descriptors, as pinned.
export const expectedG5dShader = () => { const s = profileDoc().kernel.shader; return { sha256: s.sha256, entryPoints: [...s.entryPoints], pipelines: JSON.parse(JSON.stringify(s.pipelines)) }; };

const isWord = w => typeof w === 'number' && Number.isInteger(w) && w >= 0 && w <= 0xffffffff;
const f32 = w => new Float32Array(Uint32Array.of(w).buffer)[0];
const hexw = w => (w === 0x80000000 ? 0 : w).toString(16).padStart(8, '0');   // ±0 normalised for the diagnostic hashes (§6.3)

function checkTolerances(fx) {
  const p = fx.arithmeticProtocol;
  if (p.offplane.absoluteTolerance !== TOLERANCES.absolute || p.offplane.relativeTolerance !== TOLERANCES.relative || p.plane.tolerances.logR !== TOLERANCES.logR || p.sensitivityFraction !== TOLERANCES.fraction)
    throw new Error('the frozen fixture tolerances differ from the G5-D tolerances');
}

// Header and rows of one sample, from its stride of words. Throws (a defect) for anything the kernel cannot have written.
function decodeSample(c, words, budget) {
  const [code, index, logWord, count] = words.slice(0, 4);
  const status = ARITH_STATUS[code];
  const bad = why => { throw new Error(`case ${c.id}: malformed operational header (${why}: ${words.slice(0, 4).join(', ')})`); };
  if (!status) bad('unknown status code');
  if (status === 'escaped') { if (!(index <= budget) || count !== index) bad('escape index and update count disagree'); }
  else if (status === 'budget') { if (index !== 0 || logWord !== 0 || count !== budget) bad('a budget result carries data or lacks updates'); }
  else if (!(index <= budget) || count !== index || logWord !== 0) bad('failure index and update count disagree');
  const rowWords = Array.from({ length: count }, (_, n) => words.slice(4 * (n + 1), 4 * (n + 2)));
  return { status, e: status === 'budget' ? null : index, log: status === 'escaped' ? f32(logWord) : null, rowWords, rows: rowWords.map(r => r.map(f32)) };
}

// §4.4 for one sample: status and index exactly; every component through the reference escaping iterate (all 128 for a budget result); the
// escaping log-radius. A disagreeing status or index is a failure, and its common-prefix comparison is diagnostic only.
function compareSample(c, g) {
  const ref = c.reference, refStatus = ref.e === null ? 'budget' : 'escaped';
  const statusError = g.status !== refStatus, indexError = !statusError && refStatus === 'escaped' && g.e !== ref.e;
  const L = Math.min(g.rows.length, ref.rows.length), nonfinite = [];
  let componentRatio = 0, logRRatio = 0, compared = 0;
  for (let n = 0; n < L; n++) for (let i = 0; i < 4; i++) {
    const v = g.rows[n][i], r = ref.rows[n][i];
    if (!Number.isFinite(v)) { nonfinite.push({ update: n + 1, component: i }); continue; }
    componentRatio = Math.max(componentRatio, Math.abs(v - r) / componentTolerance(r)); compared++;
  }
  if (!statusError && !indexError && refStatus === 'escaped') {
    if (!Number.isFinite(g.log)) nonfinite.push({ update: g.e, component: 'logR' });
    else logRRatio = Math.abs(g.log - ref.log) / (TOLERANCES.logR * Math.abs(ref.log));
  }
  const agree = !statusError && !indexError;
  const numericalFailure = agree && (nonfinite.length > 0 || componentRatio > 1 || logRRatio > 1);
  return { id: c.id, role: c.role, band: c.band, initial: ref.e === 0, statusError, indexError, agree, componentRatio, logRRatio, nonfinite, numericalFailure,
    outside: !agree || numericalFailure, components: agree ? 4 * ref.rows.length : 0, status: g.status, e: g.e, rows: g.rows.length };
}

const summary = list => ({ samples: list.length, outside: list.filter(s => s.outside).length, statusIndex: list.filter(s => !s.agree).length,
  numericalFailures: list.filter(s => s.numericalFailure).length, maxComponentRatio: list.reduce((m, s) => Math.max(m, s.componentRatio), 0), maxLogRRatio: list.reduce((m, s) => Math.max(m, s.logRRatio), 0) });

// Every observation recomputable from the raw, whatever its completeness: never throws. `invalidation` is the evidence defect (or null).
export function operationalObservation(raw, fx) {
  checkTolerances(fx);
  const doc = profileDoc(), matrix = loadMatrix(), L = OPERATIONAL_LAYOUT, problems = [];
  if (!raw || typeof raw !== 'object') return { form: null, collected: { batches: 0, samples: 0, continuation: false }, problems: ['no operational raw payload'], invalidation: 'G5-D operational evidence defect: no operational raw payload', metrics: null, continuation: null };
  if (raw.form !== G5D_FORM) problems.push(`form ${JSON.stringify(raw.form ?? null)} is not the G5-D plain form ${G5D_FORM}`);
  if (raw.profile !== G5D_PROFILE_ID) problems.push(`profile ${JSON.stringify(raw.profile ?? null)} is not ${G5D_PROFILE_ID}`);
  if (canonical(raw.layout ?? null) !== canonical(L) || canonical(L) !== canonical(doc.kernel.layout)) problems.push(`layout ${JSON.stringify(raw.layout ?? null)} is not the frozen operational layout`);
  const want = expectedG5dShader(), s = raw.shader;
  if (!s || typeof s !== 'object') problems.push('shader-source hash, entry points or pipeline descriptors are not recorded');
  else {
    if (s.sha256 !== want.sha256) problems.push(`shader source hash ${JSON.stringify(s.sha256 ?? null)} is not the reviewed G5-D fields + arithmetic source ${want.sha256}`);
    if (canonical(s.entryPoints ?? null) !== canonical(want.entryPoints)) problems.push(`shader entry points ${JSON.stringify(s.entryPoints ?? null)} are not the reviewed arithmetic entry points`);
    if (canonical(s.pipelines ?? null) !== canonical(want.pipelines)) problems.push('shader pipeline descriptors differ from the reviewed configuration (missing, duplicate, extra or altered module, layout, label or constants)');
  }
  if (raw.matrix?.sha256 !== doc.artifacts.matrix.sha256 || raw.matrix?.cases !== matrix.cases.length) problems.push(`matrix ${JSON.stringify(raw.matrix ?? null)} is not the authenticated matrix ${doc.artifacts.matrix.sha256} (${matrix.cases.length} cases)`);
  if (typeof raw.failure === 'string') problems.push(`collection failed: ${raw.failure}`);
  // the mandatory forced-continuation diagnostic (§7.1): eight updates of the frozen off-plane input, ignoring escape
  let continuation = null;
  const cw = raw.continuation?.words;
  if (!Array.isArray(cw) || cw.length !== 32 || !cw.every(isWord)) problems.push(`continuation: missing or malformed forced-continuation readback (${Array.isArray(cw) ? cw.length : typeof cw} words, 32 required)`);
  else {
    const orbit = fx.arithmetic.offplane.orbit.flat(), vals = cw.map(f32), rows = Array.from({ length: 8 }, (_, n) => cw.slice(4 * n, 4 * n + 4).map(hexw).join(' '));
    const nonfinite = vals.flatMap((v, i) => (Number.isFinite(v) ? [] : [{ update: Math.floor(i / 4) + 1, component: i % 4 }]));
    const componentRatio = vals.reduce((m, v, i) => (Number.isFinite(v) ? Math.max(m, Math.abs(v - orbit[i]) / componentTolerance(orbit[i])) : m), 0);
    const pred = loadPredictions();
    continuation = { componentRatio, numericalFailure: nonfinite.length > 0 || componentRatio > 1, nonfinite, rows, matches: MODEL_NAMES.filter(n => pred.models[n].continuation.rows.join('\n') === rows.join('\n')),
      historical: { 'webgpu-1': 2.7497713106862958, 'webgpu-remediation': 4.744852004194964 }, role: 'diagnostic (E8): not a qualifying pass' };
  }
  // batches: contiguous, in order, exactly the frozen sizes; each sample decoded from its own stride
  const samples = [], batches = Array.isArray(raw.batches) ? raw.batches : null;
  const expected = Math.ceil(matrix.cases.length / L.batch);
  if (!batches) problems.push('batches: no operational batch list');
  else {
    batches.forEach((b, k) => {
      const start = k * L.batch, count = Math.min(L.batch, matrix.cases.length - start);
      if (k >= expected || b?.start !== start || b?.count !== count) { problems.push(`batch ${k}: start ${b?.start} count ${b?.count}, expected start ${start} count ${count}`); return; }
      if (!Array.isArray(b.words) || b.words.length !== 4 * L.stride * count || !b.words.every(isWord)) { problems.push(`batch ${k}: missing or malformed readback (${Array.isArray(b.words) ? b.words.length : typeof b.words} words, ${4 * L.stride * count} required)`); return; }
      for (let i = 0; i < count; i++) {
        const c = matrix.cases[start + i];
        try { samples.push({ c, g: decodeSample(c, b.words.slice(4 * L.stride * i, 4 * L.stride * (i + 1)), L.budget) }); } catch (e) { problems.push(e.message); }
      }
    });
    if (batches.length < expected) problems.push(`batches: ${batches.length} of ${expected} operational batches collected`);
  }
  const compared = samples.map(({ c, g }) => compareSample(c, g)), q = compared.filter(x => x.role === 'qualifying'), d = compared.filter(x => x.role === 'diagnostic');
  const bands = Object.fromEntries(['S0', 'S1', 'S2', 'SB', 'S3'].map(b => [b, summary(compared.filter(x => x.band === b && !x.initial))]));
  bands.initial = summary(compared.filter(x => x.initial));
  // the GPU's own framed hash (§6.3 format) against each model's preregistered operational hash, whole and per case: diagnostic only
  const pred = loadPredictions();
  const framed = samples.map(({ c, g }) => (g.status === 'failure' ? `${c.id} failure ${g.e} ${g.rowWords.length}\n` + g.rowWords.map(r => r.map(hexw).join(' ') + '\n').join('') : frame(c.id, { e: g.e, rows: g.rowWords.map(r => r.map(hexw)) })));
  const complete = samples.length === matrix.cases.length;
  const operationalMatches = complete ? MODEL_NAMES.filter(n => pred.models[n].operational.sha256 === sha(framed.join(''))) : [];
  const caseAgreement = Object.fromEntries(MODEL_NAMES.map(n => [n, samples.filter(({ c }, i) => pred.models[n].operational.cases[c.id]?.sha256 === sha(framed[i])).length]));
  const invalidation = problems.length ? `G5-D operational evidence defect: ${problems.join('; ')}` : null;
  const metrics = invalidation ? null : {
    samples: compared.length, qualifying: q.length, diagnostics: d.length, components: q.reduce((n, x) => n + x.components, 0),
    statusErrors: q.filter(x => x.statusError).length, indexErrors: q.filter(x => x.indexError).length, numericalFailures: q.filter(x => x.numericalFailure).length,
    componentRatio: q.filter(x => x.agree).reduce((m, x) => Math.max(m, x.componentRatio), 0), logRRatio: q.filter(x => x.agree).reduce((m, x) => Math.max(m, x.logRRatio), 0),
  };
  const outsideOf = list => list.filter(x => x.outside).map(x => ({ id: x.id, status: x.status, e: x.e, statusError: x.statusError, indexError: x.indexError, componentRatio: x.componentRatio, logRRatio: x.logRRatio, nonfinite: x.nonfinite }));
  return {
    form: raw.form ?? null, collected: { batches: batches ? batches.filter((b, k) => b?.start === k * L.batch).length : 0, samples: samples.length, continuation: continuation !== null },
    problems, invalidation, metrics, qualifyingIds: q.map(x => x.id),
    qualifying: { ...summary(q), failing: outsideOf(q) },
    diagnostics: { role: 'diagnostic', authority: 'E9', samples: d.length, statusIndexDisagreements: d.filter(x => !x.agree).length, outsideNumericalCriteria: d.filter(x => x.outside).length,
      maxComponentRatio: d.reduce((m, x) => Math.max(m, x.componentRatio), 0), maxLogRRatio: d.reduce((m, x) => Math.max(m, x.logRRatio), 0), outside: outsideOf(d) },
    bands, continuation, operationalMatches, caseAgreement,
    scope: 'Qualifying escaping orbits cover escape indices 0–11 only; escape indices 12–128 are not validated by this qualification. Bounded orbits are tested through 128 updates.',
  };
}

export function operationalMetrics(raw, fx) {
  const o = operationalObservation(raw, fx);
  if (o.invalidation) throw invalid(o.invalidation);
  return o.metrics;
}
