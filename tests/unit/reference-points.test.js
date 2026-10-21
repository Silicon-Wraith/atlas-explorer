// Fast semantics and integrity checks; full regeneration is in tests/reference.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { nextUp, nextDown, derivativeUpdate } from '../reference/f32.js';
import { complexOrbit } from '../reference/complex.js';
import { quaternionOrbit, quaternionBound, componentsAgree, admitsRequestedComponent } from '../reference/quaternion.js';
import { bulbOrbit } from '../reference/bulb.js';
import { generateMatrix, matrixIsQualifiable, finalizeStratum, serialize, sha256, matrixHeader,
  createMatrixIndex, assembleMatrix, pointAdversarial } from '../reference/matrix.mjs';

const dir = new URL('../reference/', import.meta.url);
const bytes = name => readFileSync(new URL(name, dir));

// Recursively inspect every local dependency, including future re-exports/dynamic imports.
function independent(source, path, seen = new Set()) {
  source = source.replace(/\/\*[^]*?\*\/|\/\/[^\n]*/g, '');
  assert.ok(!/\bsrc\s*\/|(?:import\s*\(|require\s*\()\s*[^'"`\s]/.test(source), `${path}: production/computed import`);
  for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"`]([^'"`]+)['"`]/g)) {
    const specifier = match[1];
    if (specifier.startsWith('node:')) continue;
    assert.ok(specifier.startsWith('.'), `${path}: external import ${specifier}`);
    const target = new URL(specifier, path);
    assert.ok(target.href.startsWith(dir.href), `${path}: dependency escapes reference directory: ${specifier}`);
    if (!seen.has(target.href)) { seen.add(target.href); independent(readFileSync(target, 'utf8'), target, seen); }
  }
}

test('reference modules import nothing from src', () => {
  for (const file of readdirSync(dir).filter(name => /\.(m?js)$/.test(name))) independent(readFileSync(new URL(file, dir), 'utf8'), new URL(file, dir));
  for (const bad of ["import { rayFor } from '../../src/space/camera.js';", "export * from '../../src/space/camera.js';", "await import('../../src/space/camera.js');"]) {
    assert.throws(() => independent(bad, new URL('camera.js', dir)), assert.AssertionError);
  }
});

test('the complex and quaternion recurrences agree exactly on the invariant plane', () => {
  for (const c of [[-0.2, 0.8], [0, 0], [2, 0]]) for (const z of [[0, 0], [0.25, 0.5], [-0.5, 0.25], [3, 0]]) {
    const complex = complexOrbit(z, c, 128);
    const quaternion = quaternionOrbit([...z, 0, 0], [...c, 0, 0], 128, { precision: 'f64' });
    assert.ok(['escaped', 'not escaped within iteration budget'].includes(complex.status), 'complex reference must classify the orbit');
    assert.equal(complex.status, quaternion.status);
    assert.ok(Array.isArray(complex.value), 'complex reference must return its recurrence value');
    assert.deepEqual(quaternion.value, [...complex.value, 0, 0]);
    assert.equal(quaternion.escapeIndex, complex.escapeIndex);
  }
});

test('the bulb reference reproduces the axis orbit 0, 1, 2, 257 and the derivative 9217', () => {
  for (const precision of ['f32', 'f64']) {
    const result = bulbOrbit([0, 0, 1], 8, 128, { precision, history: true });
    assert.deepEqual(result.orbit, [[0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 0, 257]]);
    assert.deepEqual(result.derivatives, [0, 1, 9, 9217]);
    assert.equal(result.escapeIndex, 3);
  }
});

test('an inconclusive mandatory stratum blocks qualification', () => {
  const stratum = finalizeStratum({ id: 'floor-probe', role: 'mandatory', cases: [], excluded: [], floor: { continuous: 410 }, eligible: { continuous: 409 } });
  assert.equal(stratum.state, 'inconclusive');
  assert.equal(matrixIsQualifiable({ strata: [stratum] }), false);
  assert.equal(matrixIsQualifiable({ strata: [{ ...stratum, state: 'frozen' }] }), false, 'a forged state cannot bypass the floor');
  assert.equal(generateMatrix({ strata: [{ ...stratum, state: 'frozen' }] }).strata[0].state, 'inconclusive');
  assert.equal(matrixIsQualifiable({ strata: [{ ...stratum, role: 'diagnostic' }] }), true);
});

test('every tolerance names its analysis section', () => {
  const text = bytes('tolerance-analysis.md').toString();
  for (const tolerance of Object.values(matrixHeader().tolerances)) {
    assert.match(tolerance.analysisRef, /^tolerance-analysis\.md#/);
    assert.ok(text.includes(`id="${tolerance.analysisRef.split('#')[1]}"`));
  }
});

test('four-component probes detect a dropped or wrong j or k component', () => {
  const result = quaternionOrbit([0.25, 0.5, 0.125, -0.25], [-0.2, 0.8, 0.15, -0.1], 1, { precision: 'f64' });
  const expected = [-0.465625, 1.05, 0.2125, -0.225];
  assert.equal(componentsAgree(result.value, expected), true);
  for (const index of [2, 3]) for (const wrong of [0, -result.value[index]]) {
    const mutant = [...result.value]; mutant[index] = wrong;
    assert.equal(componentsAgree(mutant, expected), false);
  }
});

test('adjacent f32 values and the derivative at update 44 preserve range and zero semantics', () => {
  assert.equal(nextUp(0), 2 ** -149); assert.equal(nextDown(0), -(2 ** -149));
  assert.equal(nextDown(nextUp(1)), 1); assert.equal(nextUp(nextDown(-1)), -1);
  let derivative = { zero: true, mantissa: 0, exponent: 0 };
  for (let n = 1; n <= 44; n++) derivative = derivativeUpdate(derivative, 8, 1, 'f32');
  assert.ok(derivative.exponent > 127); assert.ok(derivative.mantissa >= 1 && derivative.mantissa < 2);
  const result = quaternionOrbit([0, 0, 0, 0], [2, 0, 0, 0], 64, { precision: 'f64' });
  assert.equal(result.escapeIndex, 2); assert.equal(result.estimateAvailable, false); assert.equal(result.derivative.zero, true);
});

test('exact requested-decimal boundary rejection precedes binary32 conversion', () => {
  for (const value of ['4', '-4', '4.000', '-400e-2', '0']) assert.equal(admitsRequestedComponent(value), true);
  for (const sign of ['', '-']) {
    const outside = `${sign}4.000000000000000000000000000000000000000000000000000000000000001`;
    assert.equal(Math.abs(Math.fround(Number(outside))), 4); assert.equal(admitsRequestedComponent(outside), false);
  }
});

test('sharded storage preserves order and rejects corrupt bytes or incomplete identities', () => {
  const row = (id, kind) => ({ id, kind, role: 'mandatory', floor: { semantic: 1 }, eligible: { semantic: 1 }, state: 'frozen', cases: [] });
  const matrix = { ...matrixHeader(), strata: [row('a', 'bulb-origin'), row('b', 'bulb-polar'), row('c', 'bulb-origin')], anchors: [] };
  const { index, shards } = createMatrixIndex(matrix);
  const readShard = path => shards.get(path);
  assert.deepEqual(index.stratumOrder, ['a', 'b', 'c']);
  assert.equal(index.shards.length, 2);
  assert.equal(serialize(assembleMatrix(index, readShard)), serialize(matrix));
  assert.equal(index.matrixSha256, sha256(serialize(matrix)));
  assert.throws(() => assembleMatrix(index, path => readShard(path) + ' '), /length|hash/);
  assert.throws(() => assembleMatrix(index, path => readShard(path).replace('frozen', 'broken')), /hash/);
  for (const order of [['a', 'b'], ['a', 'b', 'b'], ['a', 'b', 'unknown'], ['c', 'b', 'a']]) {
    assert.throws(() => assembleMatrix({ ...index, stratumOrder: order }, readShard), /IDs|duplicate|hash/);
  }
  const changed = structuredClone(index); changed.shards[0].stratumIds[0] = 'unexpected';
  assert.throws(() => assembleMatrix(changed, readShard), /IDs/);
  const partial = assembleMatrix(index, readShard, { kinds: ['bulb-origin'] });
  assert.equal(partial.complete, false); assert.equal(matrixIsQualifiable(partial), false);
  assert.deepEqual(partial.strata.map(s => s.id), ['a', 'c']);
});

test('partial shard loading rejects same-length corruption by its shard hash', () => {
  const matrix = { schema: 'atlas.space-matrix', version: 1, strata: [
    { id: 'a', kind: 'bulb-origin', state: 'frozen' },
    { id: 'b', kind: 'bulb-polar', state: 'frozen' },
  ] };
  const { index, shards } = createMatrixIndex(matrix);
  const options = { kinds: ['bulb-origin'] };
  const control = assembleMatrix(index, path => shards.get(path), options);
  assert.equal(control.complete, false);
  assert.deepEqual(control.strata.map(row => row.id), ['a']);
  const selected = index.shards.find(shard => shard.kind === 'bulb-origin');
  const corrupted = shards.get(selected.path).replace('frozen', 'broken');
  assert.equal(Buffer.byteLength(corrupted), selected.byteLength);
  assert.notEqual(sha256(corrupted), selected.sha256);
  assert.throws(() => assembleMatrix(index, path => {
    assert.equal(path, selected.path, 'partial loading reads only the selected shard');
    return corrupted;
  }, options), /shard hash mismatch/);
});

test('partial shard loading rejects content IDs that disagree with its declared IDs', () => {
  const matrix = { schema: 'atlas.space-matrix', version: 1, strata: [
    { id: 'a', kind: 'bulb-origin', state: 'frozen' },
    { id: 'b', kind: 'bulb-polar', state: 'frozen' },
  ] };
  const { index, shards } = createMatrixIndex(matrix);
  const options = { kinds: ['bulb-origin'] };
  assert.deepEqual(assembleMatrix(index, path => shards.get(path), options).strata.map(row => row.id), ['a']);
  const selected = index.shards.find(shard => shard.kind === 'bulb-origin');
  const changedRows = JSON.parse(shards.get(selected.path));
  changedRows[0].id = 'x';
  const changedBytes = serialize(changedRows);
  shards.set(selected.path, changedBytes);
  selected.byteLength = Buffer.byteLength(changedBytes);
  selected.sha256 = sha256(changedBytes);
  assert.deepEqual(index.stratumOrder, ['a', 'b']);
  assert.deepEqual(index.shards.flatMap(shard => shard.stratumIds), index.stratumOrder);
  assert.deepEqual(selected.stratumIds, ['a']);
  assert.deepEqual(JSON.parse(changedBytes).map(row => row.id), ['x']);
  assert.throws(() => assembleMatrix(index, path => shards.get(path), options), /shard IDs or grouping mismatch/);
});

test('all 20 adversarial point cases exercise the live reference semantics', () => {
  const cases = pointAdversarial().cases;
  assert.equal(cases.length, 20);
  for (const c of cases) {
    const v = c.inputs;
    if (v.q0) {
      const a = quaternionOrbit(v.q0, v.C, v.cap);
      if (c.id === 'zero-sensitivity') { assert.equal(a.escapeIndex, 2); assert.equal(a.estimateAvailable, false); }
      else if (c.id === 'initialization-escape' || c.id.startsWith('strict-empty')) assert.equal(a.escapeIndex, 0);
      else if (c.id === 'equal-bound-not-empty') { assert.equal(a.escapeIndex, 1); assert.equal(Math.abs(v.q0[3]) > quaternionBound(v.C), false); }
      else if (c.id === 'quaternion-fixed-origin') assert.equal(a.status, 'not escaped within iteration budget');
      else if (c.id === 'bound-corner') { assert.notEqual(a.status, 'numerical failure'); assert.ok(quaternionBound(v.C) >= (1 + Math.sqrt(33)) / 2); }
      else {
        const [r,i,j,k] = v.q0;
        const expected = [r*r-i*i-j*j-k*k+v.C[0], 2*r*i+v.C[1], 2*r*j+v.C[2], 2*r*k+v.C[3]];
        assert.deepEqual(a.value, expected);
      }
    } else if (v.p) {
      const a = bulbOrbit(v.p, v.power, v.cap);
      assert.equal(a.status, c.id === 'bulb-axis-positive' ? 'escaped' : 'not escaped within iteration budget');
      if (c.id === 'bulb-axis-positive') assert.equal(a.escapeIndex, 3);
    } else if (c.id === 'derivative-update-44') {
      let d = { zero: true, mantissa: 0, exponent: 0 };
      for (let i=0; i<44; i++) d=derivativeUpdate(d,8,1,'f32');
      assert.ok(d.exponent > 127);
    } else if (c.id === 'invalid-quaternion-parameter') assert.equal(admitsRequestedComponent(v.invalidValue), false);
    else {
      const result = c.id === 'invalid-quaternion-coordinate' ? quaternionOrbit([Infinity,0,0,0],[0,0,0,0],128)
        : bulbOrbit([c.id === 'invalid-bulb-coordinate' ? NaN : 0,0,0], c.id === 'invalid-bulb-power' ? 9 : 8, c.id === 'invalid-iteration-budget' ? 0 : 128);
      assert.equal(result.status, 'numerical failure', c.id);
    }
  }
});
