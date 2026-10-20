// spikes/project0/tests/g5d-cpu.test.mjs — G5-D preregistration (docs/reports/project0/webgpu-g5d-prereg.md) §9 items 1–4: reproduction of
// every §5–§6 count and hash, the certified radius, the sensitivity screen, and the exact U/F/A/Q predictions, plus the read-time operational
// metric's numerical behaviour (a wrong result is a numerical failure, never an evidence-format failure). CPU only: no browser, no GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT } from '../launch.mjs';
import { nextUp, nextDown } from '../reference/f32.js';

const imp = p => import(p).catch(e => ({ __missing: e.message }));
const Ref = await imp('../qualification/g5d-reference.mjs');
const Mx = await imp('../qualification/g5d-matrix.mjs');
const Md = await imp('../qualification/g5d-models.mjs');
const Mt = await imp('../qualification/g5d-metrics.mjs');
const Cf = await imp('../qualification/g5d-config.js');
const { gpuRaw } = await import('./g5d-helpers.mjs');
const fx = JSON.parse(readFileSync(new URL('../fixtures.json', import.meta.url), 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const need = (...mods) => { for (const m of mods) assert.equal(m.__missing, undefined, m.__missing); };

// The preregistered values (§5.6, §5.8, §6), transcribed independently of the implementation.
const HASH = {
  uniform: 'e5eb0b35931264f42508b7856ba872c244ddc73eacd806a0520f5bb958755823',
  neutral: 'ba0375e40e22131e019869e26814396b58c365b3806a1ec47d60e543526540c1',
  tuples: 'df6d9cb78cd9f159bd33491d14cf70e4e560446eb42a8040aab525d8764dcc79',
  matrix: 'b74ecc9e404ace915fe59fd7e4ea0acb097743157e376bff2edf45f19663c96e',
  prior: '4c1e21e80cbb1e07ae3d72cb4efc829cdd0e84f01392a4a982e78fc7f0629c10',
};
const COUNTS = {
  'uniform S0': [236492, 176142], 'uniform S1': [10749, 6011], 'uniform S2': [1992, 188], 'uniform S3': [113, 0], 'uniform SB': [654, 448],
  'neutral S0': [0, 0], 'neutral S1': [4740, 3702], 'neutral S2': [22643, 1910], 'neutral S3': [19694, 0], 'neutral SB': [202923, 54657],
};
const MODELS = {
  U: { op: 'f331de400e4631c83dabd55419d34bd2dbc8475391461918cd1c122ebd83144c', maxC: '0.2752085455', maxL: '0.1192017236', s3Out: 62, s3Idx: 1, plane: '41bc5d92adecf79818aec71b8d202f7bbc659d4365a7c00ed9dad64d24daac0f', planeL: '0.3336865173', cont: '29f1055f3644e33b2e814d2c043b6109250ebb736f51fd50b97ba4398af0e81f', contR: '0.6497890097' },
  F: { op: 'ad303936aaa072ad23286c5a437fde6da81051911be81e8f51fa39950a42d069', maxC: '0.2193153862', maxL: '0.1138465589', s3Out: 60, s3Idx: 1, plane: '48967bc57e3f267ff49b57c07fee48951e99e4e345aa1d91a3246a4f879ba9b8', planeL: '0.3686866083', cont: 'd8889f1838ae0a29b6e4e0a00ec1926efbed8245718bcc78fcc277bc0c17f31f', contR: '2.7497713107' },
  A: { op: '6228bc8e34efd493fff204c72d5a83b0fe7cf19be15e4439e61dedb5b3862703', maxC: '0.2660767700', maxL: '0.1427108871', s3Out: 61, s3Idx: 0, plane: '48967bc57e3f267ff49b57c07fee48951e99e4e345aa1d91a3246a4f879ba9b8', planeL: '0.3686866083', cont: '8f9c858d796666a1eb2f45633b9b77c2e2cabd6738e88d5e931ad2a455010899', contR: '0.6497890097' },
  Q: { op: '5c90e2e3ca57576bca1367161dd2a1ac5b14e6ee60eb5765d3b22b554926b07d', maxC: '0.3038225199', maxL: '0.1058427698', s3Out: 61, s3Idx: 1, plane: 'bd031e7309be0753fef189c461b5a8d4389787d2b69284c8925dfd42e7300406', planeL: '0.2322788006', cont: 'c73f4b529b67bbff1fcaeed98312ce367b08685d30c29b39610fd83075028301', contR: '0.8883912805' },
};
const word = x => { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, x); return b.getUint32(0).toString(16).padStart(8, '0'); };
const val = h => { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, parseInt(h, 16)); return b.getFloat32(0); };

let generated = null;                                                         // the full §5 generation, run once (about 30 s)
const generate = () => (generated ??= Mx.generateMatrix(fx));
const committedMatrix = () => JSON.parse(readFileSync(join(ROOT, 'spikes/project0/qualification/g5d-matrix.json'), 'utf8'));

// --- §9.1 reproduction ------------------------------------------------------------------------------------------------------------------------
test('G5D-9.1: the deterministic generator reproduces every §5 count and hash, all 5,121 freshness comparisons, and the committed matrix bytes', () => {
  need(Mx, Ref);
  const { matrix, audit } = generate();
  assert.equal(audit.streams.uniform, HASH.uniform); assert.equal(audit.streams.neutral, HASH.neutral);
  for (const [key, [draws, eligible]] of Object.entries(COUNTS)) { assert.equal(audit.counts[key]?.draws ?? 0, draws, key); assert.equal(audit.counts[key]?.eligible ?? 0, eligible, key); }
  assert.equal(audit.counts['uniform S0'].initial, 56992);
  assert.equal(audit.tuplesSha256, HASH.tuples); assert.equal(audit.duplicates, 0);
  assert.deepEqual(audit.prior, { count: 5121, sha256: HASH.prior });
  assert.deepEqual(audit.collisions, { uniform: 0, neutral: 0, selected: 0 });
  const bytes = Mx.serializeMatrix(matrix);
  assert.equal(sha(bytes), HASH.matrix);
  assert.equal(readFileSync(join(ROOT, 'spikes/project0/qualification/g5d-matrix.json'), 'utf8'), bytes, 'the committed matrix is exactly the generated one');
  assert.deepEqual(Object.keys(matrix).sort(), ['budget', 'cases', 'id', 'schema', 'seed']);
  assert.equal(matrix.schema, 1); assert.equal(matrix.id, 'project0-g5d-v1'); assert.equal(matrix.budget, 128); assert.equal(matrix.seed, '47354431');
});

test('G5D-9.1: the selected matrix has the preregistered dispositions, coverage and mutation detection', () => {
  need(Mx, Ref);
  const m = committedMatrix(), q = m.cases.filter(c => c.role === 'qualifying'), d = m.cases.filter(c => c.role === 'diagnostic');
  assert.equal(m.cases.length, 287); assert.equal(new Set(m.cases.map(c => c.id)).size, 287);
  assert.deepEqual(m.cases.map(c => c.id), [...m.cases.map(c => c.id)].sort(), 'sorted by id');
  for (const c of m.cases) assert.deepEqual(Object.keys(c).sort(), ['band', 'eligible', 'id', 'index', 'inputWords', 'radiusWord', 'reference', 'requested', 'role', 'screen', 'source'].sort(), c.id);
  assert.equal(q.length, 223); assert.equal(d.length, 64);
  const by = {}; for (const c of q) { const k = c.band + (c.reference.e === 0 ? '-init' : ''); by[k] = (by[k] ?? 0) + 1; }
  assert.deepEqual(by, { S0: 86, 'S0-init': 8, S1: 65, S2: 32, SB: 32 });
  assert.ok(q.every(c => c.eligible && c.screen.eligible && c.band !== 'S3'));
  assert.ok(d.every(c => c.band === 'S3' && !c.eligible)); assert.deepEqual([d.filter(c => c.source === 'uniform').length, d.filter(c => c.source === 'neutral').length], [32, 32]);
  assert.equal(4 * q.reduce((s, c) => s + c.reference.rows.length, 0), 19108);
  assert.equal(q.filter(c => Ref.isCancellation(c.reference)).length, 16);
  assert.equal(q.filter(c => c.reference.rows.some(r => Math.abs(r[2]) >= 0.1 || Math.abs(r[3]) >= 0.1)).length, 215);
  assert.ok(q.filter(c => c.band === 'SB').every(c => c.reference.rows.length === 128 && c.reference.e === null && c.reference.log === null));
  assert.deepEqual([...new Set(q.filter(c => c.band === 'S2').map(c => c.reference.e))].sort((a, b) => a - b), [8, 9, 10, 11]);
  const tuples = m.cases.map(c => c.inputWords.join(' '));
  assert.equal(new Set(tuples).size, 287, 'no duplicate selected tuple');
  assert.equal(sha(tuples.map(t => t + '\n').join('')), HASH.tuples);
  assert.deepEqual(Mx.mutationAudit(m), { j0: 215, k0: 215, jk0: 215, noCjk: 215, signAD: 215 });
});

// --- §9.2 radius ------------------------------------------------------------------------------------------------------------------------------
test('G5D-9.2: the certified radius is exact and minimal; all 16 R>2 cases; initial escape; strict boundary; escaping-iterate inclusion; null budget fields', () => {
  need(Ref);
  const m = committedMatrix(), radius = m.cases.filter(c => c.source === 'radius');
  assert.equal(radius.length, 16);
  for (const c of radius) {
    const C = c.inputWords.slice(4).map(val), R = Ref.certifiedRadius(C);
    assert.equal(word(R), '4015e10d', c.id); assert.equal(c.radiusWord, '4015e10d'); assert.equal(R, 2.3418610095977783);
    assert.equal(Ref.certifies(R, C), true); assert.equal(Ref.certifies(nextDown(R), C), false, 'minimal: the preceding binary32 value is not certified');
    assert.ok(c.eligible && c.role === 'qualifying', c.id);
    assert.deepEqual(c.requested, c.inputWords.map(val), 'requested equals the exact effective input');
    if (c.id.startsWith('I')) { assert.equal(c.reference.e, 0); assert.deepEqual(c.reference.rows, []); assert.equal(typeof c.reference.log, 'number'); }
    else { assert.equal(c.reference.e, 1); assert.equal(c.reference.rows.length, 1); assert.ok(Math.hypot(...c.inputWords.slice(0, 4).map(val)) > 2, 'starts outside radius 2'); }
    if (c.id.startsWith('R')) assert.equal(Ref.orbit(c.inputWords.slice(0, 4).map(val), C, 2).e, 0, 'hard-coding radius 2 changes the escape index');
  }
  assert.deepEqual(radius.map(c => c.id), [...Array(8).keys()].map(i => `I00000${i}`).concat([...Array(8).keys()].map(i => `R00000${i}`)));
  // every uniform/neutral case is certified at exactly 2
  for (const c of m.cases.filter(x => x.source !== 'radius')) assert.equal(c.radiusWord, '40000000', c.id);
  assert.equal(Ref.certifiedRadius([0.25, -0.5, 0.125, 0]), 2);
  // strict boundary: |q| = R is not escape; the escaping iterate is included and log is that iterate's norm
  const o = Ref.orbit([2, 0, 0, 0], [0, 0, 0, 0], 2);
  assert.equal(o.e, 1); assert.deepEqual(o.rows, [[4, 0, 0, 0]]); assert.equal(o.log, Math.log(4));
  const b = Ref.orbit([0, 0, 0, 0], [0, 0, 0, 0], 2);
  assert.equal(b.e, null); assert.equal(b.log, null); assert.equal(b.rows.length, 128);
  assert.deepEqual(Ref.step([1, 2, 3, 4], [0.5, 0.25, 0.125, 1]), [1 - 4 - 9 - 16 + 0.5, 4.25, 6.125, 9]);
});

// --- §9.3 screen ------------------------------------------------------------------------------------------------------------------------------
test('G5D-9.3: the screen visits all eight coordinates down then up at the fixed unperturbed radius, and applies the status/index, component and log criteria', () => {
  need(Ref);
  const inp = [0.25, 0.125, -0.0625, 0.03125, -0.5, 0.25, 0.125, -0.125], ref = Ref.orbit(inp.slice(0, 4), inp.slice(4), 2);
  const calls = [];
  const spy = (q, C, R) => { calls.push({ q, C, R }); return Ref.orbit(q, C, R); };
  Ref.screen(inp, 2, ref, { full: true, orbit: spy });
  assert.equal(calls.length, 16);
  calls.forEach(({ q, C, R }, i) => {
    const k = Math.floor(i / 2), v = [...q, ...C], move = i % 2 === 0 ? nextDown : nextUp;
    assert.equal(R, 2, 'the unperturbed radius is held');
    for (let j = 0; j < 8; j++) assert.equal(v[j], j === k ? move(inp[j]) : inp[j], `call ${i}, coordinate ${j}`);
  });
  const tol = r => 1e-6 + 1e-5 * Math.abs(r);
  const base = { e: 3, rows: [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 3]], log: Math.log(3) };
  const one = o => Ref.screen(inp, 2, base, { full: true, orbit: () => o });
  assert.deepEqual(one(base), { eligible: true, reasons: [] });
  const near = { ...base, rows: [[1 + 0.24 * tol(1), 1, 1, 1], ...base.rows.slice(1)] }, far = { ...base, rows: [[1 + 0.26 * tol(1), 1, 1, 1], ...base.rows.slice(1)] };
  assert.equal(one(near).eligible, true, 'within a quarter of the tolerance');
  assert.deepEqual(one(far).reasons[0], { coordinate: 0, direction: 'down', changed: ['component'] });
  assert.deepEqual(one({ ...base, log: base.log * (1 + 0.3e-5) }).reasons[0].changed, ['logR']);
  // different escape indices: status/index, common rows compared, and log compared whenever both escape (§4.5, G5D-2)
  assert.deepEqual(one({ e: 2, rows: [[1, 1, 1, 1], [1, 1, 1, 1]], log: Math.log(5) }).reasons[0].changed, ['status/index', 'logR']);
  assert.deepEqual(one({ e: 2, rows: [[1, 1, 1, 1], [1, 1, 1, 5]], log: Math.log(5) }).reasons[0].changed, ['status/index', 'component', 'logR']);
  assert.deepEqual(one({ e: 4, rows: [...base.rows, [9, 9, 9, 9]], log: base.log }).reasons[0].changed, ['status/index']);
  assert.deepEqual(one({ e: null, rows: base.rows.concat(Array(125).fill([0, 0, 0, 0])), log: null }).reasons[0].changed, ['status/index'], 'no log comparison when only one escapes');
  assert.equal(one({ e: 2, rows: [[1, 1, 1, 1], [1, 1, 1, 5]], log: base.log }).reasons.length, 16, 'every neighbour is recorded');
});

test('G5D-9.3: eligibility is exactly the recomputed screen for every selected case; roles follow only band, source and eligibility (no model input)', () => {
  need(Ref);
  const m = committedMatrix();
  for (const c of m.cases) {
    const inp = c.inputWords.map(val), R = val(c.radiusWord), ref = Ref.orbit(inp.slice(0, 4), inp.slice(4), R);
    assert.deepEqual({ e: ref.e, n: ref.rows.length, log: ref.log }, { e: c.reference.e, n: c.reference.rows.length, log: c.reference.log }, c.id);
    const s = Ref.screen(inp, R, ref, { full: true });
    assert.deepEqual(s, c.screen, c.id); assert.equal(c.eligible, s.eligible, c.id);
    assert.equal(c.band, Ref.band(ref.e), c.id);
    assert.equal(c.role, c.band !== 'S3' && c.source !== 'neutral' && s.eligible ? 'qualifying' : 'diagnostic', c.id);
  }
  const imports = f => [...readFileSync(join(ROOT, `spikes/project0/qualification/${f}`), 'utf8').matchAll(/^import \{([^}]*)\} from '([^']+)'/gm)].map(m => [m[2], m[1].split(',').map(x => x.trim()).sort()]);
  assert.ok(!imports('g5d-reference.mjs').some(([from]) => /models/.test(from)), 'the reference imports no model');
  assert.deepEqual(imports('g5d-matrix.mjs').filter(([from]) => /models/.test(from)), [['../remediation/models.js', ['generalCases']]], 'the generator imports only the remediation tuple generator (freshness), never a candidate model');
});

// --- §9.4 numerics ----------------------------------------------------------------------------------------------------------------------------
test('G5D-9.4: the four exact models reproduce every §6 operational, plane and continuation hash and summary; the committed predictions are exactly regenerated', () => {
  need(Md);
  const m = committedMatrix(), p = Md.buildPredictions(m, fx);
  for (const [name, w] of Object.entries(MODELS)) {
    const o = p.models[name];
    assert.equal(o.operational.sha256, w.op, `${name} operational`);
    assert.equal(o.operational.summary.qualifyingPass, 223); assert.equal(o.operational.summary.qualifyingStatusIndex, 0); assert.equal(o.operational.summary.qualifyingFailures, 0);
    assert.equal(o.operational.summary.maxComponentRatio.toFixed(10), w.maxC); assert.equal(o.operational.summary.maxLogRRatio.toFixed(10), w.maxL);
    assert.equal(o.operational.summary.s3Outside, w.s3Out); assert.equal(o.operational.summary.s3StatusIndex, w.s3Idx);
    assert.equal(o.plane.sha256, w.plane, `${name} plane`); assert.equal(o.plane.summary.eligibleStatusIndex, 0); assert.equal(o.plane.summary.eligibleFailures, 0);
    assert.equal(o.plane.summary.maxEligibleLogRRatio.toFixed(10), w.planeL);
    assert.equal(o.plane.cases.length, 4096);
    assert.equal(o.continuation.sha256, w.cont, `${name} continuation`); assert.equal(o.continuation.componentRatio.toFixed(10), w.contR);
  }
  assert.deepEqual(p.range, { subnormalOrUnderflow: 0, overflow: 0 });
  assert.equal(readFileSync(join(ROOT, 'spikes/project0/qualification/g5d-predictions.json'), 'utf8'), Md.serializePredictions(p));
  assert.deepEqual(Md.MODEL_NAMES, ['U', 'F', 'A', 'Q']);
});

test('G5D-9.4: the read-time operational metric passes model evidence and turns an intentionally wrong result into a numerical failure, never an evidence-format failure', () => {
  need(Md, Mt, Cf);
  const m = committedMatrix();
  for (const model of ['U', 'F', 'A', 'Q']) {
    const metrics = Mt.operationalMetrics(gpuRaw(m, model), fx);
    assert.deepEqual(Object.keys(metrics).sort(), ['componentRatio', 'components', 'diagnostics', 'indexErrors', 'logRRatio', 'numericalFailures', 'qualifying', 'samples', 'statusErrors'].sort());
    assert.deepEqual({ ...metrics, componentRatio: undefined, logRRatio: undefined }, { samples: 287, qualifying: 223, diagnostics: 64, components: 19108, statusErrors: 0, indexErrors: 0, numericalFailures: 0, componentRatio: undefined, logRRatio: undefined }, model);
    assert.equal(metrics.componentRatio.toFixed(10), MODELS[model].maxC, `${model}: the GPU-shaped words reproduce the prediction`);
    assert.ok(metrics.logRRatio < 1);
  }
  const target = m.cases.find(c => c.role === 'qualifying' && c.band === 'SB');
  const wrong = gpuRaw(m, 'F', { mutate: (c, r) => (c.id === target.id ? { ...r, rows: r.rows.map((row, n) => (n === 5 ? [word(val(row[0]) + 1e-3), ...row.slice(1)] : row)) } : r) });
  const bad = Mt.operationalMetrics(wrong, fx);
  assert.equal(bad.numericalFailures, 1); assert.ok(bad.componentRatio > 1); assert.equal(bad.statusErrors + bad.indexErrors, 0);
  const nan = gpuRaw(m, 'F', { mutate: (c, r) => (c.id === target.id ? { ...r, rows: r.rows.map((row, n) => (n === 7 ? ['7fc00000', ...row.slice(1)] : row)) } : r) });
  const nm = Mt.operationalMetrics(nan, fx);
  assert.equal(nm.numericalFailures, 1, 'a nonfinite required component is a numerical failure'); assert.ok(Number.isFinite(nm.componentRatio), 'never an infinite metric');
  const esc = m.cases.find(c => c.role === 'qualifying' && c.reference.e === 5);
  const idx = gpuRaw(m, 'F', { mutate: (c, r) => (c.id === esc.id ? { ...r, e: 4, rows: r.rows.slice(0, 4) } : r) });
  const im = Mt.operationalMetrics(idx, fx);
  assert.equal(im.indexErrors, 1); assert.equal(im.components, 19108 - 4 * 5, 'a disagreeing sample is not compared component-wise');
  const st = gpuRaw(m, 'F', { mutate: (c, r) => (c.id === target.id ? { status: 'escaped', e: 9, rows: r.rows.slice(0, 9), log: 1 } : r) });
  assert.equal(Mt.operationalMetrics(st, fx).statusErrors, 1);
  const lg = gpuRaw(m, 'F', { mutate: (c, r) => (c.id === esc.id ? { ...r, log: r.log * (1 + 3e-5) } : r) });
  const lm = Mt.operationalMetrics(lg, fx);
  assert.equal(lm.numericalFailures, 1); assert.ok(lm.logRRatio > 1);
});

test('G5D-9.4: the forced-continuation diagnostic recomputes the frozen eight-iterate ratio from raw words and names the matching models', () => {
  need(Md, Mt, Cf);
  const m = committedMatrix();
  for (const model of ['U', 'F', 'A', 'Q']) {
    const o = Mt.operationalObservation(gpuRaw(m, model), fx);
    assert.equal(o.continuation.componentRatio.toFixed(10), MODELS[model].contR, model);
    assert.ok(o.continuation.matches.includes(model), model);
    assert.equal(o.operationalMatches.includes(model), true, `${model}: the whole operational readback equals its predicted hash`);
  }
  assert.deepEqual(Mt.operationalObservation(gpuRaw(m, 'U'), fx).continuation.matches, ['U'], 'U and A share a ratio but not their words');
});
