// spikes/project0/tests/qualify.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest, checkCoherence, qualify, ABORTS, requiredSlots, validateSelection, recompute, unsafeFromLaunches } from '../qualify.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ROOT } from '../launch.mjs';
import { sha256, launchIdentity } from '../evidence.mjs';
import { GATES } from '../contract.js';
import { gatePlan } from '../gates.js';

const identity = { backend: 'webgpu', fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64), implementationCommit: 'd'.repeat(40), implementationHash: 'e'.repeat(64), launchHash: 'f'.repeat(64), browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's', mode: 'headless' };
const fixture = { fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64) };
const rec = (gate, slot, extra = {}) => ({ schema: 1, id: `${gate}-${slot}-run`, gate, slot, campaign: 'webgpu-1', experiment: false, identity, invalidations: [], artifacts: [], metrics: {}, ...extra });
const base = { fixture, campaign: 'webgpu-1', args: 'attempt1', requestedArgs: ['--enable-gpu'], runDirs: [] };
const eligible = n => Array.from({ length: n }, (_, id) => ({ id, eligible: true }));
const fx = { analytic: { sphere: { rays: Array(625) } }, arithmetic: { bulb: eligible(4096), plane: eligible(4096) } };

test('the manifest selects each slot once and refuses development, missing-campaign, experiment or mixed-fixture evidence', () => {
  const m = buildManifest({ ...base, records: [rec('G4', 'bulb-samples'), rec('G5', 'qjulia-plane')] });
  assert.deepEqual(Object.keys(m.trials).sort(), ['G4/bulb-samples', 'G5/qjulia-plane']);
  assert.throws(() => buildManifest({ ...base, records: [rec('G4', 'bulb-samples'), rec('G4', 'bulb-samples', { id: 'x' })] }), /duplicate/);
  for (const campaign of ['dev', 'probe', undefined]) assert.throws(() => buildManifest({ ...base, records: [rec('G4', 'bulb-samples', { campaign })] }), /campaign/);
  assert.throws(() => buildManifest({ ...base, records: [rec('precision', 'precision', { experiment: true })] }), /experiment/);
  assert.throws(() => buildManifest({ ...base, records: [rec('G4', 'bulb-samples', { identity: { ...identity, fixtureHash: '9'.repeat(64) } })] }), /fixture/);
});

test('read-side validation: a selected development or experiment record is refused before evaluation', () => {
  const m = buildManifest({ ...base, records: [rec('G4', 'bulb-samples')] });
  const forged = rec('G4', 'bulb-samples', { campaign: 'dev', experiment: true });
  assert.throws(() => qualify(m, [forged], fx), /experiment record/);
  assert.throws(() => qualify(m, [rec('G4', 'bulb-samples', { campaign: 'dev' })], fx), /campaign dev/);
  assert.throws(() => validateSelection(m, [rec('G4', 'no-such-slot')], gatePlan(fx)), /unknown slot/);
});

test('a forged stop entry can never produce a pass, and cannot coexist with selected trials', () => {
  assert.throws(() => buildManifest({ ...base, records: [], notRun: Object.fromEntries(GATES.map(g => [g, { status: 'pass', reason: 'x' }])) }), /only 'not run'/);
  const ok = buildManifest({ ...base, records: [], notRun: Object.fromEntries(GATES.map(g => [g, { status: 'not run', reason: 'campaign stopped' }])) });
  const { decision, backend } = qualify(ok, [], fx);
  assert.notEqual(decision.outcome, 'WebGPU selected');
  assert.ok(Object.values(backend.gates).every(g => g.status === 'not run'));
  assert.throws(() => buildManifest({ ...base, records: [rec('G4', 'bulb-samples')], notRun: { G4: { status: 'not run', reason: 'x' } } }), /coexist/);
  const edited = { ...ok, notRun: { ...ok.notRun, G5: { status: 'pass', reason: 'edited after build' } } };
  assert.throws(() => qualify(edited, [], fx), /only 'not run'/);
});

test('blockedBy must name a gate whose evidence failed', () => {
  const m = buildManifest({ ...base, records: [], notRun: { G6: { status: 'not run', reason: 'stopped', blockedBy: 'G4' } } });
  assert.throws(() => qualify(m, [], fx), /blockedBy G4 is not a measured failure/);
});

test('coherence: one backend, environment and launch configuration per mode; reuse must be justified exactly', () => {
  const a = rec('G4', 'bulb-samples'), b = rec('G5', 'qjulia-plane', { identity: { ...identity, driver: 'other' } });
  assert.throws(() => checkCoherence([a, b], { reuse: [] }), /driver/);
  const c = rec('G5', 'qjulia-plane', { identity: { ...identity, implementationCommit: '1'.repeat(40) } });
  assert.throws(() => checkCoherence([a, c], { reuse: [] }), /implementation/);
  assert.doesNotThrow(() => checkCoherence([a, c], { reuse: [{ gate: 'G5', slot: 'qjulia-plane', recordId: c.id, reason: 'unaffected by the change set' }] }));
  assert.throws(() => checkCoherence([a, c], { reuse: [{ gate: 'G5', slot: 'qjulia-plane', recordId: 'other', reason: 'r' }] }), /implementation/);
  const d = rec('G5', 'qjulia-plane', { identity: { ...identity, launchHash: '2'.repeat(64) } });
  assert.throws(() => checkCoherence([a, d], { reuse: [{ gate: 'G5', slot: 'qjulia-plane', recordId: d.id, reason: 'r' }] }), /launch/);
});

test('required slots per invocation: reusing headed G1 still requires headless; one G5 or G6 slot does not cover the rest', () => {
  const plan = gatePlan(fx);
  assert.deepEqual(requiredSlots('G1', 'headless', plan), ['G1/headless']);
  assert.deepEqual(requiredSlots('G5', 'headless', plan).sort(), ['G5/qjulia-offplane', 'G5/qjulia-plane']);
  const timing = requiredSlots('timing', 'headed', plan);
  assert.equal(timing.filter(k => k.startsWith('G6/')).length, 9); assert.equal(timing.filter(k => k.startsWith('G7/')).length, 3); assert.ok(timing.includes('G9/warmed'));
});

test('abort conditions are detected from record invalidations and metrics', () => {
  const reasons = r => ABORTS.map(f => f(r)).filter(Boolean);
  assert.deepEqual(reasons(rec('G12', 'sequence', { metrics: { unplannedLosses: 1 } })), ['unexpected device loss']);
  assert.deepEqual(reasons(rec('G6', 'bulb-overview/0', { invalidations: ['device lost: unknown'] })), ['unexpected device loss']);
  assert.deepEqual(reasons(rec('G11', '4k', { invalidations: ['metrics: allocation cap exceeded: 1 + 2 > 1'] })), ['allocation cap exceeded']);
  assert.deepEqual(reasons(rec('G1', 'headed', { metrics: { nvidia: 0, software: 1, corroborated: 0 } })), ['software execution detected']);
  assert.deepEqual(reasons(rec('G3', 'box', { invalidations: ['no observable progress for 5 s: […]'] })), ['submission stalled for 5 s']);
  assert.deepEqual(reasons(rec('G6', 'bulb-overview/0', { invalidations: ['page: browser hang: the page did not answer within 10000 ms'] })), ['browser hang']);
  assert.deepEqual(reasons(rec('G6', 'bulb-overview/0', { invalidations: ['metrics: driver error: harness readback timeout: mapping did not complete within 5000 ms'] })), ['harness readback timeout'], 'a readback timeout stops the campaign');
  assert.deepEqual(reasons(rec('G10', 'bulb-overview', { invalidations: ['harness timeout: no publication within 20000 ms'] })), ['harness timeout'], 'a publication deadline stops the campaign');
  assert.deepEqual(reasons(rec('G6', 'bulb-overview/0', { metrics: { published: 900 } })), []);
});

test('unsafeFlag follows the effective command line, consistently with the requested flags', () => {
  const l = (req, cl) => ({ requestedArgs: req, commandLine: cl });
  assert.equal(unsafeFromLaunches([l(['--enable-gpu'], 'chrome --enable-gpu')]), false);
  assert.equal(unsafeFromLaunches([l(['--enable-gpu'], 'chrome --enable-gpu --enable-unsafe-webgpu')]), true, 'an effective-only flag counts');
  assert.throws(() => unsafeFromLaunches([l(['--enable-unsafe-webgpu'], 'chrome --enable-gpu')]), /absent from the effective command line/);
});

test('recompute refuses a missing, duplicate or mismatched launch artefact on a qualifying record', async () => {
  const base = resolve(ROOT, 'artifacts/runtime'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'p0-launch-test-'));
  try {
    await mkdir(join(root, 'artifacts/project0/r'), { recursive: true });
    const raw = '{}', launch = { requestedArgs: ['--enable-gpu'], commandLine: 'chrome --enable-gpu --user-data-dir=/p', profile: '/p', mode: 'headless' };
    const lt = JSON.stringify(launch);
    await writeFile(join(root, 'artifacts/project0/r/a.raw.json'), raw); await writeFile(join(root, 'artifacts/project0/r/a.launch.json'), lt);
    const artefact = (name, data) => ({ path: `r/${name}`, sha256: sha256(data) });
    const mk = (artifacts, extra = {}) => ({ ...rec('G9', 'warmed'), identity: { ...identity, ...launchIdentity(launch) }, invalidations: ['skip metrics'], artifacts, ...extra });
    const manifest = { requestedArgs: ['--enable-gpu'] };
    await assert.rejects(recompute([mk([artefact('a.raw.json', raw)], { invalidations: [] })], {}, { root, manifest }), /exactly one launch artefact/);
    await assert.rejects(recompute([mk([artefact('a.raw.json', raw), artefact('a.launch.json', lt), artefact('a.launch.json', lt)])], {}, { root, manifest }), /exactly one launch artefact/);
    await assert.rejects(recompute([mk([artefact('a.raw.json', raw), artefact('a.launch.json', lt)], { identity: { ...identity, launchHash: '3'.repeat(64) } })], {}, { root, manifest }), /does not reproduce/);
    await assert.rejects(recompute([mk([artefact('a.raw.json', raw), artefact('a.launch.json', lt)])], {}, { root, manifest: { requestedArgs: ['--other'] } }), /declared configuration/);
    const { launches } = await recompute([mk([artefact('a.raw.json', raw), artefact('a.launch.json', lt)])], {}, { root, manifest });
    assert.equal(launches.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
