// spikes/project0/tests/remediation-validate.test.mjs — read-time validation of the G5-A compensation (prereg rev 2 §2.6–§2.7) and its
// binding into the G5 off-plane metric derivation, from synthetic readbacks built out of the committed model words. CPU only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compensationReport, supplementary, COMPENSATED_FORM, expectedShader } from '../remediation/validate.mjs';
import { metrics } from '../measure/arith.mjs';

const fx = JSON.parse(readFileSync(new URL('../fixtures.json', import.meta.url), 'utf8'));
const supp = supplementary();
const w = h => parseInt(h, 16);
// fix round 1 (finding 4): the shader identity must be the reviewed one, so the fixture reports exactly that
const shader = expectedShader();
function rawFor(models) {                       // models: which model's words each part reports
  const m = { primitives: 'F', dots: 'F', updates: 'F', offplane: 'F', ...models };
  const orbitWords = supp.offplane.rows[m.offplane].flatMap(r => r.split(' ').map(w));
  return {
    form: COMPENSATED_FORM, orbitWords, orbit: Array.from(new Float32Array(Uint32Array.from(orbitWords).buffer)),
    supplementary: { shader, primitives: supp.primitives.expected[m.primitives].flat().map(w), dots: supp.dots.expected[m.dots].flatMap(x => [w(x), 0, 0, 0]), updates: supp.updates.expected[m.updates].flat().map(w) },
  };
}

test('Model F words everywhere validate the compensation and match only Model F', () => {
  const r = compensationReport(rawFor({}), fx);
  assert.deepEqual(r.problems, []); assert.equal(r.validated, true); assert.deepEqual(r.matches, ['F']);
  assert.equal(r.counts.primitiveIdentityFailures, 0);
});

test('a negative-control match is recorded as that model and leaves the compensation unvalidated', () => {
  for (const name of ['S', 'DB', 'SDB']) {
    const r = compensationReport(rawFor({ updates: name, offplane: name }), fx);
    assert.equal(r.validated, false); assert.deepEqual(r.matches, [name]);
    assert.ok(r.problems.some(p => p.includes(`negative control(s) ${name}`)));
  }
  const u = compensationReport(rawFor({ primitives: 'U', dots: 'U', updates: 'U', offplane: 'U' }), fx);
  assert.equal(u.validated, false); assert.deepEqual(u.matches, ['U']);
  assert.ok(u.counts.primitiveIdentityFailures > 0, 'the unfused residual fails the exact identity');
});

test('an off-plane qualification entry point that differs from Model F leaves the compensation unvalidated even when the validation entry points match', () => {
  const r = compensationReport(rawFor({ offplane: 'DB' }), fx);
  assert.equal(r.validated, false); assert.deepEqual(r.matches, []);
  assert.ok(r.problems.some(p => /offplane: \d+ of 8 differ from Model F/.test(p)));
});

test('±0 is normalised for supplementary bit comparisons; nonfinite words, malformed or missing evidence are rejected', () => {
  const raw = rawFor({}); const zero = raw.supplementary.primitives.indexOf(0);
  assert.ok(zero >= 0); raw.supplementary.primitives[zero] = 0x80000000;
  assert.equal(compensationReport(raw, fx).validated, true);
  const nan = rawFor({}); nan.supplementary.updates[5] = 0x7fc00000;
  assert.ok(compensationReport(nan, fx).problems.some(p => /nonfinite/.test(p)));
  const short = rawFor({}); short.supplementary.updates.pop();
  assert.ok(compensationReport(short, fx).problems.some(p => /updates: missing or malformed/.test(p)));
  assert.equal(compensationReport({ ...rawFor({}), supplementary: undefined }, fx).validated, false);
  assert.equal(compensationReport({ ...rawFor({}), form: undefined }, fx).validated, false);
  const noShader = rawFor({}); noShader.supplementary.shader = { ...shader, pipelines: shader.pipelines.filter(p => p.entryPoint !== 'qjulia_offplane') };
  assert.ok(compensationReport(noShader, fx).problems.some(p => /pipeline descriptors differ/.test(p)));
  const mixed = rawFor({}); mixed.orbit[0] += 1;
  assert.ok(compensationReport(mixed, fx).problems.some(p => /disagree/.test(p)));
});

test('the exact oracle checks the GPU primitive words themselves: a corrupted residual fails the identity and Model F', () => {
  const raw = rawFor({}); const i = supp.primitives.expected.F.findIndex(row => row[1] !== '00000000');
  raw.supplementary.primitives[4 * i + 1] ^= 1;
  const r = compensationReport(raw, fx);
  assert.equal(r.validated, false); assert.equal(r.counts.primitiveIdentityFailures, 1);
});

test('the G5 off-plane metric: legacy evidence keeps its original derivation; compensated evidence is validated at read time and the frozen ratio is kept beside an unvalidated verdict', () => {
  const legacy = metrics('G5', 'qjulia-offplane', { orbit: fx.arithmetic.offplane.orbit.flat() }, fx);
  assert.deepEqual(legacy, { components: 32, componentRatio: 0 });
  const good = metrics('G5', 'qjulia-offplane', rawFor({}), fx);
  assert.deepEqual(good, { components: 32, componentRatio: 0.8883912804919689 });
  assert.throws(() => metrics('G5', 'qjulia-offplane', rawFor({ updates: 'S', offplane: 'S' }), fx), e => e.invalidation === true && /^compensation unvalidated: /.test(e.message) && /componentRatio=0\.66/.test(e.message) && /match model\(s\) S/.test(e.message));
  assert.throws(() => metrics('G5', 'qjulia-offplane', rawFor({ updates: 'DB', offplane: 'DB' }), fx), e => /numerical failure: componentRatio=2\.28481606431775/.test(e.message));
  assert.throws(() => metrics('G5', 'qjulia-offplane', { ...rawFor({}), supplementary: undefined }, fx), /compensation unvalidated: .*no supplementary validation evidence/);
});
