// spikes/project0/remediation/generate.mjs — generates the committed G5-A CPU artefacts (prereg rev 2 §2.5, §2.6):
//   remediation/supplementary.json  expected words of all five models for the primitive grid, witnesses and 1,024 cases, the off-plane rows;
//   remediation/plane-model-f.json  the Model F plane artefact over all 4,096 frozen samples, in frozen order;
//   remediation/manifest.json       generator, serialisation and the sha256 of both artefacts, plus the five preregistered row hashes.
// Serialisation: contract.js `canonical` JSON followed by one LF. Words are lowercase eight-digit binary32 hex.
// node spikes/project0/remediation/generate.mjs [--check]   (--check regenerates and compares, writing nothing)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { canonical } from '../contract.js';
import { compareArithmetic, ratio } from '../metrics.js';
import { R, add, sub, mul, fromBits, toBits, toNumber, hex, isExactSum, RANGE } from './exact.js';
import { MODELS, NEGATIVE_CONTROLS, EXACTNESS, twoProductFMA, twoSum, compDot, update, crUpdate, offplaneOrbit, rowsText, generalCases, primitiveGrid, WITNESSES } from './models.js';

export const artefactHash = text => createHash('sha256').update(text).digest('hex');
const encode = value => canonical(value) + '\n';
const words = values => values.map(v => hex(toBits(v)));
export const GENERATOR = 'spikes/project0/remediation/generate.mjs';
export const SERIALISATION = 'contract.js canonical JSON + LF; binary32 words as lowercase 8-digit hex';
const PREREG = 'docs/reports/project0/webgpu-remediation-prereg.md, revision 2, commit 44e21fd';

export function buildSupplementary(fx) {
  const before = { ...EXACTNESS }, rangeBefore = RANGE.subnormalOrUnderflow;
  const { values, pairs } = primitiveGrid();
  const W = WITNESSES;
  // primitive inputs: the 1,369 grid pairs (a-major), then the product witness and the TwoSum witness
  const primitivePairs = [...pairs, [fromBits(W.product.a), fromBits(W.product.b)], [fromBits(W.twoSum.a), fromBits(W.twoSum.b)]];
  const primitives = { inputs: primitivePairs.map(words), expected: {} };
  for (const name of Object.keys(MODELS)) primitives.expected[name] = primitivePairs.map(([a, b]) => [...words(twoProductFMA(a, b, MODELS[name])), ...words(twoSum(a, b))]);
  for (const [a, b] of primitivePairs) {                     // the independent exact oracle: rounded high component and high + low = exact
    const [p, e] = twoProductFMA(a, b, MODELS.F), [s, t] = twoSum(a, b);
    if (toBits(p) !== toBits(R(mul(a, b))) || !isExactSum(p, e, mul(a, b)) || toBits(s) !== toBits(R(add(a, b))) || !isExactSum(s, t, add(a, b))) throw new Error('primitive oracle failure');
  }
  const dotInputs = [[...W.dot.x.flatMap((x, i) => [x, W.dot.y[i]])]];
  const dots = { inputs: dotInputs.map(w => w.map(hex)), expected: {} };
  for (const name of Object.keys(MODELS)) dots.expected[name] = dotInputs.map(w => hex(toBits(compDot([fromBits(w[0]), fromBits(w[2])], [fromBits(w[1]), fromBits(w[3])], MODELS[name]))));
  if (dots.expected.F[0] !== hex(W.dot.result)) throw new Error('dot witness');

  const cases = generalCases();
  const updates = { seed: '504f3035', count: cases.length, inputs: cases.map(c => words([...c.q, ...c.C])), expected: {}, differingFromF: {}, exactPolynomial: cases.map(c => words(crUpdate(c.q, c.C))) };
  for (const name of Object.keys(MODELS)) updates.expected[name] = cases.map(c => words(update(c.q, c.C, MODELS[name])));
  for (const name of NEGATIVE_CONTROLS) updates.differingFromF[name] = updates.expected[name].filter((w, i) => w.join() !== updates.expected.F[i].join()).length;

  const offplane = { rows: {}, rowHashes: {}, maxRatio: {} };
  for (const name of Object.keys(MODELS)) {
    const o = offplaneOrbit(fx, MODELS[name]);
    offplane.rows[name] = o.rows.map(r => r.join(' ')); offplane.rowHashes[name] = artefactHash(rowsText(o.rows)); offplane.maxRatio[name] = o.maxRatio;
  }
  const cr = offplaneOrbit(fx, null, crUpdate);
  offplane.correctlyRoundedPolynomialHash = artefactHash(rowsText(cr.rows));
  offplane.correctlyRoundedPolynomialEqualsF = offplane.correctlyRoundedPolynomialHash === offplane.rowHashes.F;   // recorded; no optimality claim
  // the §2.3 range assumptions on every vector and trajectory evaluated above: every Model F primitive exact, no subnormal or underflow
  const range = { modelFPrimitivesChecked: EXACTNESS.checked - before.checked, modelFPrimitivesInexact: EXACTNESS.failed - before.failed, subnormalOrUnderflowRoundings: RANGE.subnormalOrUnderflow - rangeBefore };
  if (range.modelFPrimitivesInexact || range.subnormalOrUnderflowRoundings) throw new Error(`range assumption violated: ${JSON.stringify(range)}`);
  return encode({ schema: 1, preregistration: PREREG, generator: GENERATOR, serialisation: SERIALISATION,
    note: 'Supplementary validation of the compensated G5-A update. Not a frozen fixture; U, S, DB and SDB are diagnostic negative controls, never acceptable outcomes.',
    grid: { values: words(values), order: 'ordered pairs, first operand major; then the product witness and the TwoSum witness' },
    primitives, dots, updates, offplane, range,
    witnesses: { product: hexed(W.product), twoSum: hexed(W.twoSum), dot: { x: W.dot.x.map(hex), y: W.dot.y.map(hex), result: hex(W.dot.result) }, S: { index: W.S.index }, DB: { index: W.DB.index } } });
}
const hexed = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hex(v)]));

// The Model F plane recurrence of arithmetic.wgsl qjulia_plane: q0 = (x, y, 0, 0), C = (Cr, Ci, 0, 0), escape tested at n = 0 .. cap with
// |q| > 2. The norm and logarithm are binary64 (Math.hypot, Math.log): labelled not bit-predictive of GPU execution, as are the escape
// decisions that depend on them. The frozen GPU-versus-complex comparison remains authoritative.
export const PLANE_LABEL = 'norm and logarithm in binary64: not bit-predictive of GPU execution';
export function buildPlaneArtifact(fx) {
  const cap = fx.arithmeticProtocol.plane.iterations, tolerances = fx.arithmeticProtocol.plane.tolerances, rows = [], samples = [];
  const rangeBefore = RANGE.subnormalOrUnderflow, before = { ...EXACTNESS };
  for (const s of fx.arithmetic.plane) {
    const [x, y, cr, ci] = s.input.map(v => { if (Math.fround(v) !== v) throw new Error(`plane sample ${s.id}: input is not binary32`); return fromBits(new Uint32Array(Float32Array.of(v).buffer)[0]); });
    let q = [x, y, fromBits(0), fromBits(0)]; const C = [cr, ci, fromBits(0), fromBits(0)];
    let row = { id: s.id, status: 'budget', index: null, logR: null };
    for (let n = 0; n <= cap; n++) {
      const r = Math.hypot(...q.map(toNumber));
      if (r > 2) { row = { id: s.id, status: 'escaped', index: n, logR: Math.log(r) }; break; }
      if (n === cap) break;
      q = update(q, C, MODELS.F);
    }
    rows.push(row);
    const ref = s.reference;
    let predicted = { status: row.status, index: row.index, logR: row.logR };
    if (s.eligible) {
      const statusMatch = row.status === ref.status, indexMatch = row.index === ref.index;
      const logRRatio = row.status === 'escaped' && ref.status === 'escaped' ? ratio(row.logR, ref.logR, tolerances.logR * Math.abs(ref.logR)) : 0;
      predicted = { ...predicted, statusMatch, indexMatch, logRRatio, pass: statusMatch && indexMatch && logRRatio <= 1 };
    }
    samples.push({ id: s.id, eligible: s.eligible, reasons: s.reasons, predicted });
  }
  const summary = compareArithmetic(fx.arithmetic.plane, rows, tolerances);
  const range = { modelFPrimitivesChecked: EXACTNESS.checked - before.checked, modelFPrimitivesInexact: EXACTNESS.failed - before.failed, subnormalOrUnderflowRoundings: RANGE.subnormalOrUnderflow - rangeBefore };
  const predictedOutcome = summary.statusErrors === 0 && summary.indexErrors === 0 && summary.logRRatio <= 1 && samples.every(x => !x.eligible || x.predicted.pass) ? 'pass' : 'fail';
  return encode({ schema: 1, preregistration: PREREG, generator: GENERATOR, serialisation: SERIALISATION, model: 'F', label: PLANE_LABEL,
    recurrence: 'arithmetic.wgsl qjulia_plane with the compensated update; escape |q| > 2 tested at n = 0..cap; budget at cap', cap, samples, summary, predictedOutcome, range });
}

export function buildAll(fx) {
  const supplementary = buildSupplementary(fx), plane = buildPlaneArtifact(fx), supp = JSON.parse(supplementary), planeParsed = JSON.parse(plane);
  const manifest = encode({ schema: 1, preregistration: PREREG, generator: GENERATOR, serialisation: SERIALISATION,
    supplementary: { path: 'spikes/project0/remediation/supplementary.json', sha256: artefactHash(supplementary) },
    plane: { path: 'spikes/project0/remediation/plane-model-f.json', sha256: artefactHash(plane), predictedOutcome: planeParsed.predictedOutcome, summary: planeParsed.summary, label: PLANE_LABEL },
    offplaneRowHashes: supp.offplane.rowHashes, offplaneMaxRatio: supp.offplane.maxRatio, updatesDifferingFromF: supp.updates.differingFromF,
    correctlyRoundedPolynomialEqualsF: supp.offplane.correctlyRoundedPolynomialEqualsF });
  return { supplementary, plane, manifest };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fx = JSON.parse(readFileSync(new URL('../fixtures.json', import.meta.url), 'utf8'));
  const out = buildAll(fx), names = { supplementary: 'supplementary.json', plane: 'plane-model-f.json', manifest: 'manifest.json' };
  if (process.argv.includes('--check')) {
    const bad = Object.entries(names).filter(([k, f]) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8') !== out[k]).map(([, f]) => f);
    console.log(bad.length ? `REMEDIATION ARTEFACTS DIFFER: ${bad.join(', ')}` : 'REMEDIATION ARTEFACTS OK');
    process.exitCode = bad.length ? 1 : 0;
  } else {
    for (const [k, f] of Object.entries(names)) writeFileSync(new URL(`./${f}`, import.meta.url), out[k]);
    console.log(out.manifest);
  }
}
