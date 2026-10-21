import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateEvidence, classifySuiteRun } from '../../scripts/gate/lib.mjs';
import { APPROVED_REFERENCE_IDENTITIES, REFERENCE_CHECKS, REFERENCE_SUITE_MS, REFERENCE_WORK_MS } from '../../scripts/gate/reference-evidence.mjs';
import { runReferenceChecks } from '../support/reference-checks.mjs';

const suite = { id: 'reference', evidence: 'reference', report: 'artifacts/reference-report.json', requiredPasses: Object.keys(REFERENCE_CHECKS) };
const identities = { ...APPROVED_REFERENCE_IDENTITIES };
const passing = () => Object.entries(REFERENCE_CHECKS).map(([name, checked]) => ({ name, state: 'passed', checked: { ...checked }, identities: { ...identities }, durationMs: 1 }));

for (const key of Object.keys(identities)) {
  test(`reference suite rejects a consistent re-freeze of ${key}`, () => {
    assert.equal(validateEvidence(suite, { report: passing() }).ok, true);
    const report = passing();
    for (const entry of report) entry.identities[key] = 'f'.repeat(64);
    const evidence = validateEvidence(suite, { report });
    assert.equal(evidence.ok, false, `all checks agree on an unapproved ${key}`);
    assert.equal(classifySuiteRun({ exitCode: 0, signal: null, timedOut: false, cleanup: 'confirmed' }, evidence).state, 'failed');
  });
}

test('reference suite evidence requires complete regeneration counts and consistent identities', () => {
  assert.equal(validateEvidence(suite, { report: passing() }).ok, true);
  for (const change of [
    report => report.pop(),
    report => report.push(report[0]),
    report => { report[0].checked.strata--; },
    report => { report[0].checked.mandatory = 0; },
    report => { report[2].checked.rays--; },
    report => { report[1].state = 'incomplete'; },
    report => { report[1].identities.matrixSha256 = 'f'.repeat(64); },
    report => { delete report[0].identities.indexSha256; },
    report => { report[0].durationMs = REFERENCE_WORK_MS + 1; },
    report => { report[0].durationMs = NaN; },
  ]) {
    const report = passing(); change(report);
    assert.equal(validateEvidence(suite, { report }).ok, false);
  }
  assert.equal(validateEvidence(suite, {}).kind, 'missing');
  assert.equal(validateEvidence(suite, { report: [] }).ok, false);
  assert.equal(validateEvidence({ ...suite, requiredPasses: [] }, { report: passing() }).ok, false);
  const ok = { exitCode: 0, signal: null, timedOut: false, cleanup: 'confirmed' };
  for (const run of [{ ...ok, timedOut: true }, { ...ok, exitCode: 1 }, { ...ok, exitCode: 124 }, { ...ok, cleanup: 'unconfirmed' }]) {
    assert.notEqual(classifySuiteRun(run, validateEvidence(suite, { report: passing() })).state, 'passed');
  }
});

test('the reference suite is mandatory CPU work with an explicit bound and no server', () => {
  const manifest = JSON.parse(readFileSync(new URL('../suites.manifest.json', import.meta.url)));
  const entry = manifest.suites.find(s => s.id === 'reference');
  assert.deepEqual(entry, { ...suite, gpu: false, server: false, timeoutMs: REFERENCE_SUITE_MS, command: ['tests/reference.mjs'] });
  assert.equal(REFERENCE_SUITE_MS, 600_000);
  assert.ok(REFERENCE_WORK_MS < REFERENCE_SUITE_MS);
});

test('the reference executor enforces its deadline and never accepts missing or failed work', async () => {
  const calls = [];
  const checks = Object.entries(REFERENCE_CHECKS).map(([name, checked]) => ({ name, run: () => { calls.push(name); return { ...checked }; } }));
  const options = { checks, identities, now: () => 0 };
  const report = await runReferenceChecks(options);
  assert.equal(validateEvidence(suite, { report }).ok, true);
  assert.deepEqual(calls, Object.keys(REFERENCE_CHECKS));
  await assert.rejects(runReferenceChecks({ ...options, checks: checks.slice(1) }), /checks|coverage/);
  let clock = 0;
  await assert.rejects(runReferenceChecks({ ...options, now: () => clock, checks: checks.map((check, i) => ({ ...check, run: context => {
    if (i === 0) { clock = REFERENCE_WORK_MS + 1; context.checkDeadline(); }
    assert.fail('no work may continue after its deadline');
  } })) }), { code: 'ATLAS_REFERENCE_TIMEOUT' });
  const events = [];
  await assert.rejects(runReferenceChecks({ ...options, onPass: entry => events.push(entry), checks: checks.map((check, i) => ({ ...check, run: () => {
    if (i === 0) throw new Error('regeneration mismatch');
    assert.fail('no later check after failed regeneration');
  } })) }), /regeneration mismatch/);
  assert.deepEqual(events, []);
  await assert.rejects(runReferenceChecks({ ...options, checks: checks.map(check => ({ ...check, run: () => ({}) })) }), /coverage|reference/);
});
