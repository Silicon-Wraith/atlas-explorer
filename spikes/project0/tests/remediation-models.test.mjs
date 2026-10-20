// spikes/project0/tests/remediation-models.test.mjs — G5-A CPU models (prereg rev 2 §2.5–§2.6): the five exact models, their
// preregistered row hashes, the witnesses, the 1,024 general cases, the primitive grid and the committed artefacts. CPU only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fromBits, toBits, add, sub, mul, R, isExactSum } from '../remediation/exact.js';
import { MODELS, twoProductFMA, twoSum, compDot, update, crUpdate, offplaneOrbit, rowsText, generalCases, primitiveGrid, WITNESSES } from '../remediation/models.js';
import { buildSupplementary, buildPlaneArtifact, artefactHash } from '../remediation/generate.mjs';

const fx = JSON.parse(readFileSync(new URL('../fixtures.json', import.meta.url), 'utf8'));
const sha = text => createHash('sha256').update(text).digest('hex');

// prereg §2.5, verbatim
const PREREGISTERED = {
  F: { hash: 'c73f4b529b67bbff1fcaeed98312ce367b08685d30c29b39610fd83075028301', ratio: 0.8883912804919689, iterate: 7, component: 0 },
  U: { hash: '7f454fa613b9b0439a4d52dcba8651a8cbc0a36e11d431c7a54d0270f62c24c6', ratio: 0.6605694682138076, iterate: 8, component: 0 },
  S: { hash: '4eb056b882d9ce00c88576aeaa0424ea9e9d6e2987a2b857ce6bf2604ac1347e', ratio: 0.6605694682138076, iterate: 8, component: 0 },
  DB: { hash: '6221a8ba8bc5c3319b11ce5cc3c85651385bddb3f0d50581f8dd7feb377f0023', ratio: 2.28481606431775, iterate: 8, component: 1 },
  SDB: { hash: '29940152cdb885a8cdd0cee6ca5a4bdb9fbf9c6c10938f7373c22df143f53306', ratio: 2.191825015044041, iterate: 8, component: 1 },
};
const F_ROWS = ['beee6666 3f866666 3d800000 be000000', 'bf8d77ff be361475 bd6e6666 3dee6666', '3f79144b 3f98b5b5 3e03be25 be83be25', 'bf426ba4 4047c80b 3e802e63 bf002e63',
  'c11ae4fc c07c3fff bec2b219 3f42b219', '429a8642 429a39ba 40eb9a93 c16b9a93', 'c3782a63 463a326b 448e368c c50e368c', 'cd0d8a4f cab47faa c909dc64 4989dc64'];

test('each model reproduces its preregistered off-plane rows, row hash, maximum ratio and location', () => {
  for (const [name, want] of Object.entries(PREREGISTERED)) {
    const orbit = offplaneOrbit(fx, MODELS[name]);
    assert.equal(sha(rowsText(orbit.rows)), want.hash, `${name} row hash`);
    assert.equal(orbit.maxRatio.ratio, want.ratio, `${name} ratio`);
    assert.deepEqual([orbit.maxRatio.iterate, orbit.maxRatio.component], [want.iterate, want.component], `${name} location`);
  }
  assert.deepEqual(offplaneOrbit(fx, MODELS.F).rows.map(r => r.join(' ')), F_ROWS);
});

test('the per-component correctly rounded exact-polynomial orbit equals Model F (recorded, no optimality claim)', () => {
  assert.equal(sha(rowsText(offplaneOrbit(fx, null, crUpdate).rows)), PREREGISTERED.F.hash);
});

test('the §2.4 product witness: F keeps the residual, U loses it', () => {
  const a = fromBits(0x3f800001), b = fromBits(0x3f7fffff);           // 1 + 2^-23, 1 - 2^-24
  assert.deepEqual(twoProductFMA(a, b, MODELS.F).map(toBits), [0x3f800000, 0x337ffffe]);
  assert.deepEqual(twoProductFMA(a, b, MODELS.U).map(toBits), [0x3f800000, 0]);
});

test('the TwoSum and compensated-dot witnesses', () => {
  assert.deepEqual(twoSum(fromBits(0x3f800000), fromBits(0x33800000)).map(toBits), [0x3f800000, 0x33800000]);
  const dot = compDot([fromBits(0x3f800001), fromBits(0xbf800000)], [fromBits(0x3f7fffff), fromBits(0x3f800000)], MODELS.F);
  assert.equal(toBits(dot), 0x337ffffe);
});

test('the product-fed quaternion witnesses are the first S and DB differences, zero-based, with the preregistered words', () => {
  const cases = generalCases();
  const firstDiff = name => cases.findIndex(c => update(c.q, c.C, MODELS[name]).map(toBits).join() !== update(c.q, c.C, MODELS.F).map(toBits).join());
  assert.equal(firstDiff('S'), 26); assert.equal(firstDiff('DB'), 1);
  const words = (q, C, m) => update(q, C, MODELS[m]).map(v => toBits(v).toString(16).padStart(8, '0')).join(' ');
  const hex = c => [...c.q, ...c.C].map(v => toBits(v).toString(16).padStart(8, '0')).join(' ');
  assert.equal(hex(cases[26]), 'c040a42d 406a2b6f 3effa6ac 4061c3d9 3f432d94 bfc4efac bf1b6f74 4040350e');
  assert.equal(words(cases[26].q, cases[26].C, 'F'), 'c182107c c1bc85bb c0673cd2 c191dd0a');
  assert.equal(words(cases[26].q, cases[26].C, 'S'), 'c182107b c1bc85bb c0673cd2 c191dd0a');
  assert.equal(hex(cases[1]), 'bf798023 bfc827fd bfcf02e6 bfeac58f 3f311e22 c05df698 bf5666ff 3fbddc9b');
  assert.equal(words(cases[1].q, cases[1].C, 'F'), 'c0d90fe5 bed71c1c 401427b0 40a1defc');
  assert.equal(words(cases[1].q, cases[1].C, 'DB'), 'c0d90fe5 bed71c1b 401427b0 40a1defc');
  assert.deepEqual(WITNESSES.S, { index: 26 }); assert.deepEqual(WITNESSES.DB, { index: 1 });
});

test('the 1,024 general cases differ from Model F in the preregistered numbers', () => {
  const cases = generalCases();
  assert.equal(cases.length, 1024);
  const counts = {};
  for (const name of ['U', 'S', 'DB', 'SDB']) counts[name] = cases.filter(c => update(c.q, c.C, MODELS[name]).map(toBits).join() !== update(c.q, c.C, MODELS.F).map(toBits).join()).length;
  assert.deepEqual(counts, { U: 787, S: 72, DB: 600, SDB: 607 });
});

test('the primitive grid has 37 values and 1,369 ordered pairs; under Model F both primitives are exact (high + low = exact operation)', () => {
  const { values, pairs } = primitiveGrid();
  assert.equal(values.length, 37); assert.equal(pairs.length, 1369);
  for (const [a, b] of pairs) {
    const [p, e] = twoProductFMA(a, b, MODELS.F);
    assert.equal(toBits(p), toBits(R(mul(a, b)))); assert.ok(isExactSum(p, e, mul(a, b)), 'TwoProductFMA exact');
    const [s, t] = twoSum(a, b);
    assert.equal(toBits(s), toBits(R(add(a, b)))); assert.ok(isExactSum(s, t, add(a, b)), 'TwoSum exact');
  }
  assert.ok(!isExactSum(fromBits(0x3f800000), fromBits(0), sub(fromBits(0x3f800000), fromBits(0x33800000))));
});

test('the committed supplementary data and plane artefact regenerate byte for byte and match the manifest hashes', () => {
  const manifest = JSON.parse(readFileSync(new URL('../remediation/manifest.json', import.meta.url), 'utf8'));
  const supp = readFileSync(new URL('../remediation/supplementary.json', import.meta.url), 'utf8');
  assert.equal(supp, buildSupplementary(fx));
  assert.equal(artefactHash(supp), manifest.supplementary.sha256);
  for (const [name, want] of Object.entries(PREREGISTERED)) assert.equal(manifest.offplaneRowHashes[name], want.hash);
  const plane = readFileSync(new URL('../remediation/plane-model-f.json', import.meta.url), 'utf8');
  assert.equal(artefactHash(plane), manifest.plane.sha256);
  const parsed = JSON.parse(plane);
  assert.equal(parsed.samples.length, 4096);
  assert.equal(parsed.label, 'norm and logarithm in binary64: not bit-predictive of GPU execution');
  assert.equal(parsed.predictedOutcome, 'pass');
  assert.ok(parsed.samples.every(s => !s.eligible || s.predicted.pass), 'no eligible sample is predicted to fail');
  assert.deepEqual(parsed.samples.map(s => [s.id, s.eligible, JSON.stringify(s.reasons)]), fx.arithmetic.plane.map(s => [s.id, s.eligible, JSON.stringify(s.reasons)]));
});

test('the plane artefact regenerates (a 256-sample stride subset, the full check is generate.mjs --check)', () => {
  const plane = JSON.parse(readFileSync(new URL('../remediation/plane-model-f.json', import.meta.url), 'utf8'));
  const subset = fx.arithmetic.plane.filter((_, i) => i % 16 === 0);
  const again = JSON.parse(buildPlaneArtifact({ ...fx, arithmetic: { ...fx.arithmetic, plane: subset } }, { summaryOnly: false }));
  assert.deepEqual(again.samples, plane.samples.filter((_, i) => i % 16 === 0));
});
