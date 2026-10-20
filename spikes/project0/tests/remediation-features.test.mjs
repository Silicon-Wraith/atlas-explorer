// spikes/project0/tests/remediation-features.test.mjs — evidence under the remediation launch configuration (prereg rev 2 §2.7, §3.5): the
// compensated-form declaration, the unchanged feature-request policy over every recorded acquisition, the attempt-1 granted-set comparison
// (equal / differs / unavailable, never inferred), and their enforcement in qualify.mjs recompute. CPU only; fixtures under artifacts/runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ROOT, DEVELOPER_FLAG } from '../launch.mjs';
import { sha256, launchIdentity } from '../evidence.mjs';
import { acquisitionProblems, featureComparison, remediationRecordProblems, requestedFor } from '../remediation/evidence-rules.mjs';
import { COMPENSATED_FORM } from '../remediation/validate.mjs';
import { recompute } from '../qualify.mjs';

const acq = (requested, available, granted = requested.filter(f => available.includes(f))) => ({ requestedFeatures: requested, features: available, grantedFeatures: granted, epoch: 1 });
const REM = { requestedArgs: ['--enable-gpu', DEVELOPER_FLAG] }, A1 = { requestedArgs: ['--enable-gpu'] };

test('the request policy: G1 and the checks path request nothing; the session path requests only timestamp-query; granted = requested ∩ available', () => {
  assert.deepEqual(requestedFor('G1'), []); assert.deepEqual(requestedFor('G5'), []); assert.deepEqual(requestedFor('G8'), ['timestamp-query']); assert.deepEqual(requestedFor('G13'), ['timestamp-query']);
  assert.deepEqual(acquisitionProblems('G1', [acq([], ['timestamp-query', 'subgroups'])]), []);
  assert.deepEqual(acquisitionProblems('G8', [acq(['timestamp-query'], ['timestamp-query']), acq(['timestamp-query'], [])]), []);
  assert.ok(acquisitionProblems('G1', [acq(['timestamp-query'], ['timestamp-query'])]).some(p => /policy for G1/.test(p)));
  assert.ok(acquisitionProblems('G8', [acq(['timestamp-query', 'subgroups'], ['timestamp-query', 'subgroups'])]).some(p => /policy/.test(p)), 'no newly exposed feature is requested');
  assert.ok(acquisitionProblems('G8', [acq(['timestamp-query'], ['timestamp-query'], [])]).some(p => /requested ∩ available/.test(p)));
  assert.ok(acquisitionProblems('G5', undefined).some(p => /no acquisition record/.test(p)));
  assert.ok(acquisitionProblems('G5', [{ requestedFeatures: [] }]).some(p => /not recorded/.test(p)));
});

test('the attempt-1 comparison: equal or differs against a comparable acquired-device record; unavailable when attempt 1 has none — never inferred', () => {
  const rem = { id: 'r', gate: 'G1', slot: 'headed', identity: { mode: 'headed' } };
  const baseline = { records: [{ id: 'b1', gate: 'G1', identity: { mode: 'headed' } }, { id: 'b2', gate: 'G1', identity: { mode: 'headless' } }, { id: 'b5', gate: 'G5', identity: { mode: 'headed' } }],
    raws: { b1: { adapterInfo: { grantedFeatures: [] } }, b2: { adapterInfo: null }, b5: { orbit: [] } } };
  assert.equal(featureComparison(rem, { acquisitions: [acq([], ['subgroups'])] }, baseline).status, 'equal');
  assert.equal(featureComparison(rem, { acquisitions: [acq([], ['x'], ['x'])] }, baseline).status, 'differs');
  assert.equal(featureComparison({ ...rem, slot: 'headless', identity: { mode: 'headless' } }, { acquisitions: [acq([], [])] }, baseline).status, 'unavailable', 'attempt 1 never acquired a headless device');
  assert.equal(featureComparison({ id: 'g5', gate: 'G5', slot: 'qjulia-offplane', identity: { mode: 'headed' } }, { acquisitions: [acq([], [])] }, baseline).status, 'unavailable', 'attempt-1 checks raws recorded no acquisition');
  assert.equal(featureComparison({ id: 'g8', gate: 'G8', slot: '0', identity: { mode: 'headed' } }, { acquisitions: [acq(['timestamp-query'], ['timestamp-query'])] }, baseline).status, 'unavailable', 'attempt 1 never ran G8');
});

test('remediation records: G5 must declare the compensated form; attempt-1 records are untouched by the remediation rules', () => {
  const g5 = { id: 'g5', gate: 'G5', slot: 'qjulia-plane', identity: { mode: 'headed' } }, ok = { acquisitions: [acq([], [])] };
  assert.ok(remediationRecordProblems(g5, ok, REM, null).some(p => /compensated form/.test(p)));
  assert.deepEqual(remediationRecordProblems(g5, { ...ok, form: COMPENSATED_FORM }, REM, null), []);
  assert.deepEqual(remediationRecordProblems(g5, {}, A1, null), [], 'attempt-1 evidence keeps its original rules');
});

async function scratch() { const dir = resolve(ROOT, 'artifacts/runtime'); await mkdir(dir, { recursive: true }); return mkdtemp(join(dir, 'p0-rem-')); }
test('recompute refuses a clean remediation-configuration record that breaks the rules, and reports the attempt-1 comparison', async () => {
  const root = await scratch();
  try {
    const put = async (id, gate, slot, raw, requestedArgs) => {
      const d = join(root, 'artifacts/project0', 'run'); await mkdir(d, { recursive: true });
      const launch = { requestedArgs, commandLine: `chrome ${requestedArgs.join(' ')} --user-data-dir=/p`, profile: '/p', mode: 'headed' }, rt = JSON.stringify(raw), lt = JSON.stringify(launch);
      await writeFile(join(d, `${id}.raw.json`), rt); await writeFile(join(d, `${id}.launch.json`), lt);
      return { schema: 1, id, gate, slot, campaign: 'webgpu-remediation', experiment: false, invalidations: [], metrics: {}, identity: { mode: 'headed', ...launchIdentity(launch) },
        artifacts: [{ path: `run/${id}.raw.json`, sha256: sha256(rt) }, { path: `run/${id}.launch.json`, sha256: sha256(lt) }] };
    };
    const args = ['--enable-gpu', DEVELOPER_FLAG];
    const bad = await put('G5-qjulia-plane-run', 'G5', 'qjulia-plane', { words: [], acquisitions: [acq([], [])] }, args);
    const { errors, featureComparison: rows } = await recompute([bad], {}, { root, manifest: { requestedArgs: args }, collect: true, baseline: { records: [], raws: {} } });
    assert.match(errors[bad.id], /compensated form/);
    assert.deepEqual(rows.map(r => [r.id, r.status]), [[bad.id, 'unavailable']]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('finalise records the invocation\'s acquisitions in every raw and labels timestamp values under the developer flag', async () => {
  const { finalise } = await import('../run.mjs');
  const { launchDisclosures } = await import('../launch.mjs');
  const written = [];
  const write = async (dir, record, files) => { written.push({ record, raw: JSON.parse(files[0].data) }); return record; };
  const acquisitions = [acq(['timestamp-query'], ['timestamp-query'])];
  const common = { mode: 'headed', campaign: 'dev', runDir: '/x/run', identity: {}, chromeGpuText: '', invalidations: [], fixtures: {}, experiment: true, write };
  await finalise({ ...common, gate: 'smoke', launchInfo: { disclosures: launchDisclosures(['--enable-gpu', DEVELOPER_FLAG]) }, outcome: { result: { slots: [{ slot: 's', raw: { timestamps: 'timestamp-query' } }], invalidations: [], acquisitions } } });
  await finalise({ ...common, gate: 'smoke', launchInfo: { disclosures: launchDisclosures(['--enable-gpu']) }, outcome: { result: { slots: [{ slot: 's', raw: { timestamps: 'timestamp-query' } }], invalidations: [], acquisitions } } });
  assert.deepEqual(written[0].raw.acquisitions, acquisitions); assert.equal(written[0].raw.timestampLabel, 'browser timestamp quantization disabled');
  assert.equal(written[1].raw.timestampLabel, undefined, 'attempt-1 values are not relabelled');
});

test('the driver registry returns the document\'s acquisition log with every result', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../browser/drivers/index.js', import.meta.url), 'utf8');
  assert.match(src, /return \{ \.\.\.result, acquisitions: acquisitionLog\(\) \};/);
});

test('the campaign refuses the remediation configuration without the attempt-1 baseline, and loads it before the preflight', async () => {
  const { runCampaign } = await import('../campaign.mjs');
  const calls = [], options = [];
  const d = { LAUNCH: { remediation: ['--enable-gpu', DEVELOPER_FLAG] },
    runSession: async o => { calls.push(`session ${o.gate}`); return { records: [], runDir: `/x/${o.gate}` }; }, runG2: async () => ({ records: [], runDir: '/x/g2' }),
    runPreflight: async () => { calls.push('preflight'); return { pass: false, record: null, runDir: '/x/pf' }; },
    implementationIdentity: async () => ({}), fixtureIdentity: async () => ({}), readFixtures: async () => JSON.parse((await import('node:fs')).readFileSync(new URL('../fixtures.json', import.meta.url), 'utf8')), loadCampaign: async () => { throw new Error('none'); },
    verifyPreflight: async () => {}, bindAuxiliary: async () => ({}), recompute: async (records, fx, o) => { options.push(o); return { records, launches: [], raws: {}, errors: {} }; },
    writeReport: async () => {}, log: () => {} };
  await assert.rejects(runCampaign({ name: 'webgpu-remediation', args: 'remediation' }, d), /attempt-1 baseline/);
  assert.deepEqual(calls, [], 'nothing ran');
  const baseline = { records: [], raws: {} };
  await assert.rejects(runCampaign({ name: 'webgpu-remediation', args: 'remediation' }, { ...d, loadBaseline: async () => baseline }), /integrity preflight/);
  assert.deepEqual(calls, ['preflight'], 'the baseline is loaded before the preflight');
});

test('loadBaseline verifies the committed webgpu-1 campaign read-only and finds attempt 1\'s only comparable acquired-device record (G1 headed, granted [])', async () => {
  const { loadBaseline } = await import('../qualify.mjs');
  const b = await loadBaseline();
  const g1 = b.records.find(r => r.gate === 'G1' && r.identity.mode === 'headed');
  assert.ok(g1); assert.deepEqual(b.raws[g1.id].adapterInfo.grantedFeatures, []);
  const rows = b.records.map(r => [r.gate, r.identity.mode, featureComparison({ ...r }, { acquisitions: [acq(requestedFor(r.gate), [])] }, b).status]);
  assert.deepEqual(rows.filter(([, , s]) => s !== 'unavailable').map(([g, m]) => `${g} ${m}`), ['G1 headed']);
});
