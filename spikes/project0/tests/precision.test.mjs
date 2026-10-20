// spikes/project0/tests/precision.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { precisionMetrics, medianOf, assessPrecision } from '../measure/precision.mjs';

const fx = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
const f32bits = x => new Uint32Array(new Float32Array([x]).buffer)[0];
const echo = (set, variant) => set.rows.flatMap(r => { const p = r[variant].primary; const code = { hit: 0, miss: 1, unresolved: 2, failure: 3 }[p.status]; return [code, p.status === 'unresolved' ? (p.reason === 'point' ? 1 : 2) : 0, p.status === 'miss' ? 0 : f32bits(p.t), Math.max(1, p.steps)]; });
const goodPrims = () => fx.primitives.map(p => { const v = p.value; const hi = Math.fround(v), lo = Math.fround(v - hi); return { hi, lo, thenHi: p.thenValue ?? 0, thenLo: 0 }; });
const sample = () => Array.from({ length: 10 }, (_, i) => 10 + i);
const raw = () => ({ primitives: goodPrims(), sets: fx.precision.results.map(set => ({ distance: set.distance, baseline: { words: echo(set, 'baselineInput'), workMs: sample(), readMs: sample(), peakBytes: 1000 }, compensated: { words: echo(set, 'compensatedInput'), workMs: sample(), readMs: sample(), peakBytes: 1500 } })) });

test('a perfect echo of the CPU references shows no disagreement at the first distance, with matched costs', () => {
  const m = precisionMetrics(fx, raw());
  assert.equal(m.validated, true);
  assert.equal(m.rows[0].baseline.vsBaselineInput.statusDisagreements, 0);
  assert.equal(m.rows[0].baseline.vsBaselineInput.largeDepthErrors, 0);
  assert.deepEqual(m.rows[0].cost.baseline.workMs, { median: 14.5, min: 10, max: 19, samples: 10 });
  assert.equal(m.rows[0].extraBytes, 500);
});

test('medianOf ten samples is the mean of the 5th and 6th sorted samples', () => {
  assert.equal(medianOf([9, 1, 8, 2, 7, 3, 6, 4, 5, 10]), 5.5);
});

test('primitive results are judged against the frozen fixture cases only', () => {
  const r = raw(); r.primitives[0] = { hi: 1, lo: 0, thenHi: 0, thenLo: 0 };          // a reassociated two_sum loses 2^-25
  assert.equal(precisionMetrics(fx, r).validated, false);
  const partial = raw(); partial.primitives.pop();
  assert.throws(() => precisionMetrics(fx, partial), /one result per frozen primitive case/);
  const nan = raw(); nan.primitives[1].lo = NaN;
  assert.throws(() => precisionMetrics(fx, nan), /finite/);
});

test('the first stop latches: a locally stable later distance is still not interpreted', () => {
  const fx2 = structuredClone(fx);
  fx2.precision.results[2].stopReasons = ['anchor uncertainty'];                        // an early stop, followed by distances that would compare cleanly
  const m = precisionMetrics(fx2, raw());
  assert.deepEqual(m.firstStop, { distance: fx2.precision.results[2].distance, reasons: ['anchor uncertainty'] });
  assert.deepEqual(m.rows.map(r => r.interpreted), [true, true, false, false, false, false, false, false]);
  assert.equal(m.rows[3].baseline.vsRequested.stopReasons.length, 0, 'distance 3 is locally interpretable, yet not interpreted');
});

test('cost evidence must follow the frozen protocol exactly', () => {
  const short = raw(); short.sets[0].baseline.workMs = [1];
  assert.throws(() => precisionMetrics(fx, short), /exactly 10 finite, nonnegative samples/);
  const negative = raw(); negative.sets[0].compensated.readMs[3] = -1;
  assert.throws(() => precisionMetrics(fx, negative), /nonnegative/);
  const fractional = raw(); fractional.sets[0].compensated.peakBytes = 1.5;
  assert.throws(() => precisionMetrics(fx, fractional), /nonnegative integer/);
});

test('the assessment is derived from evidence: invalidations, completeness and the selected environment decide interpretability', () => {
  const identity = { browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's', mode: 'headed', launchHash: 'f'.repeat(64) };
  const selected = [{ identity }];
  const clean = { slot: 'precision', invalidations: [], identity };
  assert.equal(assessPrecision({ fx, record: clean, raw: raw(), selected }).interpretable, true);
  assert.equal(assessPrecision({ fx, record: { ...clean, invalidations: ['device lost: unknown'] }, raw: raw(), selected }).interpretable, false);
  assert.equal(assessPrecision({ fx, record: { ...clean, slot: 'incomplete' }, raw: {}, selected }).interpretable, false);
  const moved = assessPrecision({ fx, record: { ...clean, identity: { ...identity, driver: 'other' } }, raw: raw(), selected });
  assert.equal(moved.interpretable, false); assert.match(moved.environmentError, /driver/);
  const otherLaunch = assessPrecision({ fx, record: { ...clean, identity: { ...identity, launchHash: '1'.repeat(64) } }, raw: raw(), selected });
  assert.match(otherLaunch.environmentError, /headed launch configuration/);
  const broken = assessPrecision({ fx, record: clean, raw: { primitives: [], sets: [] }, selected });
  assert.equal(broken.interpretable, false); assert.match(broken.interpretationError, /one result per frozen primitive case/); assert.deepEqual(broken.executionInvalidations, []);
});
