// spikes/project0/tests/qualification-e7.test.mjs — E7 / G1-D (Codex design run 20261020T042650Z-8f9e): the hash-pinned headed-only
// qualification profile, its verified context, the effective plan, the headed-only G1 evaluator, the excluded-trial and known-limitation
// representation, and the campaign/qualify/closure integration. CPU only: no browser, no GPU; filesystem fixtures under artifacts/runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm, readFile, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from '../launch.mjs';
import { canonical, GATES } from '../contract.js';
import { gatePlan } from '../gates.js';
import { EXPECTED_TIMING } from '../timing-contract.js';
import { decideBackends } from '../decision.js';
import { SOURCE_PATHS } from '../fixture-files.mjs';

const Qn = await import('../qualification.mjs').catch(() => ({}));
const Q = await import('../qualify.mjs');
const GC = await import('../gates-checked.js');
const fx = JSON.parse(readFileSync(new URL('../fixtures.json', import.meta.url), 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const ID = 'project0-e7-headed-v1', PATH = 'spikes/project0/qualification/e7-headed-v1.json', HASH = '99ea9a3030fd31f68a3cb39cc97b10227fd28afdfc38e55a82119618991d8c51';
const REF = { id: ID, path: PATH, sha256: HASH };
const AMENDMENT = { schema: 1, id: ID, authority: { decision: 'E7', commit: 'e3ee2c0a584c5daa4df750332e82d64b88aa5251' },
  baseSpecHash: '64d82abf00e50c97c72347d7f4fa2d7b9dfd86240e73441b099a31afc8b1c645', fixtureHash: 'ab15af0e527e60168b9cffc6328dadfd0846430da416ba06334fe041907ba0d1',
  preregistration: { path: 'docs/reports/project0/webgpu-remediation-prereg.md', sha256: '5ceb90f2713df52bea1e104bf3543886f57af9f51ebd496cc993ac9c7dedc39a' },
  backend: 'webgpu', campaign: 'webgpu-remediation', executionMode: 'headed', excludedRequiredSlots: ['G1/headless'] };
const EXCLUDED = { 'G1/headless': { disposition: 'not-required', authority: 'E7', collection: 'not-scheduled-in-this-campaign' } };
const fixture = { fixtureHash: AMENDMENT.fixtureHash, fixtureCommit: '5638678f5752ce4c6a40f36b280e1ce13ed52480', specHash: AMENDMENT.baseSpecHash };
const identity = mode => ({ backend: 'webgpu', ...fixture, implementationCommit: 'd'.repeat(40), implementationHash: 'e'.repeat(64), launchHash: 'f'.repeat(64), browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's', mode });
const plan = gatePlan(fx);
const rec = (gate, slot, extra = {}) => ({ schema: 1, id: `${gate}-${slot.replace(/[^A-Za-z0-9.-]/g, '_')}-run`, gate, slot, campaign: 'webgpu-remediation', experiment: false, identity: identity('headed'),
  invalidations: [], artifacts: [{ path: 'r/x.raw.json', sha256: '0'.repeat(64) }], metrics: Object.fromEntries(Object.entries(plan[gate]?.[slot] ?? {}).map(([k, [, a]]) => [k, a])), timingMethod: EXPECTED_TIMING[gate][0], ...extra });
const rawsOf = rs => Object.fromEntries(rs.map(r => [r.id, r.timingMethod?.field ? { [r.timingMethod.field]: 1 } : {}]));
const load = async () => Qn.loadQualification(ID);
const base = ctx => ({ fixture, campaign: 'webgpu-remediation', args: 'remediation', requestedArgs: ['--enable-gpu'], qualification: ctx });
async function scratch() { const dir = resolve(ROOT, 'artifacts/runtime'); await mkdir(dir, { recursive: true }); return mkdtemp(join(dir, 'p0-e7-')); }
async function copyTree(root, paths) { for (const p of paths) { await mkdir(join(root, dirname(p)), { recursive: true }); await copyFile(join(ROOT, p), join(root, p)); } }

// --- authentication -----------------------------------------------------------------------------------------------------------------------
test('E7: the committed amendment is exactly the designed object, canonically serialised, with the pinned hash', async () => {
  const bytes = readFileSync(join(ROOT, PATH), 'utf8');
  assert.equal(bytes, canonical(AMENDMENT) + '\n'); assert.equal(sha(bytes), HASH);
  assert.deepEqual(Qn.QUALIFICATIONS, { [ID]: { path: PATH, sha256: HASH } }, 'the registry pins this one profile');
  const ctx = await load();
  assert.equal(Qn.isVerifiedQualification(ctx), true); assert.deepEqual(Qn.qualificationReference(ctx), REF);
  assert.equal(Qn.isVerifiedQualification(JSON.parse(JSON.stringify(ctx))), false, 'a serialised copy is not a verified context');
  assert.equal(Qn.isVerifiedQualification({ ...REF, verified: true }), false, 'a saved verified flag never authorises');
});

test('E7: unknown id, missing file, altered bytes, noncanonical bytes and a changed preregistration fail closed', async () => {
  await assert.rejects(Qn.loadQualification('project0-e7-headless-waiver'), /unknown qualification/);
  await assert.rejects(Qn.loadQualification(undefined), /unknown qualification/);
  const root = await scratch();
  try {
    await assert.rejects(Qn.loadQualification(ID, { root }), /cannot be read/);
    await copyTree(root, [PATH, AMENDMENT.preregistration.path]);
    assert.ok(await Qn.loadQualification(ID, { root }));
    const altered = { ...AMENDMENT, excludedRequiredSlots: ['G1/headless', 'G1/headed'] };
    await writeFile(join(root, PATH), canonical(altered) + '\n');
    await assert.rejects(Qn.loadQualification(ID, { root }), /does not match its pinned hash/);
    await writeFile(join(root, PATH), JSON.stringify(AMENDMENT, null, 2));
    await assert.rejects(Qn.loadQualification(ID, { root }), /does not match its pinned hash/);
    await writeFile(join(root, PATH), canonical(AMENDMENT) + '\n');
    await writeFile(join(root, AMENDMENT.preregistration.path), 'edited');
    await assert.rejects(Qn.loadQualification(ID, { root }), /preregistration/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('E7: a manifest reference must match the verified context exactly; altered bytes with a recomputed manifest hash, wrong fixture, specification or scope are refused', async () => {
  const ctx = await load();
  const m = Q.buildManifest({ records: [], ...base(ctx) });
  assert.deepEqual(m.qualification, REF); assert.deepEqual(m.excludedTrials, EXCLUDED);
  assert.doesNotThrow(() => Qn.validateQualification(m, ctx));
  const altered = canonical({ ...AMENDMENT, excludedRequiredSlots: ['G1/headless', 'G2/fresh-0'] }) + '\n';
  assert.throws(() => Qn.validateQualification({ ...m, qualification: { ...REF, sha256: sha(altered) } }, ctx), /qualification reference/);
  assert.throws(() => Qn.validateQualification({ ...m, qualification: { ...REF, id: 'x' } }, ctx), /qualification reference/);
  assert.throws(() => Qn.validateQualification({ ...m, qualification: undefined }, ctx), /qualification reference/);
  assert.throws(() => Qn.validateQualification(m, { ...ctx }), /verified qualification/);
  assert.throws(() => Qn.validateQualification(m, null), /verified qualification/);
  assert.throws(() => Qn.validateQualification({ ...m, fixture: { ...fixture, specHash: '1'.repeat(64) } }, ctx), /base specification/);
  assert.throws(() => Qn.validateQualification({ ...m, fixture: { ...fixture, fixtureHash: '1'.repeat(64) } }, ctx), /fixture/);
  assert.throws(() => Qn.validateQualification({ ...m, campaign: 'webgpu-3' }, ctx), /campaign/);
  assert.throws(() => Q.buildManifest({ records: [], ...base(ctx), campaign: 'webgpu-3' }), /campaign/);
});

// --- no unauthorised expansion; legacy preservation ---------------------------------------------------------------------------------------
test('E7: the effective plan removes only G1/headless; nothing else changes, and an unverified context changes nothing', async () => {
  const ctx = await load(), eff = Qn.effectiveGatePlan(fx, ctx), frozen = gatePlan(fx);
  delete frozen.G1.headless;
  assert.equal(canonical(eff), canonical(frozen));
  assert.ok(gatePlan(fx).G1.headless, 'the frozen plan itself is untouched');
  assert.throws(() => Qn.effectiveGatePlan(fx, { ...ctx }), /verified qualification/);
  assert.equal(canonical(Qn.effectiveGatePlan(fx, null)), canonical(gatePlan(fx)));
  for (const extra of [{ ...EXCLUDED, 'G1/headed': EXCLUDED['G1/headless'] }, { ...EXCLUDED, 'G2/fresh-0': EXCLUDED['G1/headless'] }, { 'G1/headless': { ...EXCLUDED['G1/headless'], disposition: 'pass' } }, {}])
    assert.throws(() => Qn.validateQualification({ ...Q.buildManifest({ records: [], ...base(ctx) }), excludedTrials: extra }, ctx), /excludedTrials/);
});

test('legacy: without E7 the checked G1 evaluator still requires both modes, and a legacy manifest may not carry exclusions', async () => {
  const m = { fixture, campaign: 'webgpu-1', trials: { 'G1/headed': { id: rec('G1', 'headed').id, identity: identity('headed') } } };
  const r = rec('G1', 'headed', { campaign: 'webgpu-1' });
  assert.deepEqual(GC.evaluateGateChecked('G1', [r], m, fx, { raws: rawsOf([r]) }).reasons, ['missing required trials']);
  assert.throws(() => Qn.validateQualification({ ...m, excludedTrials: EXCLUDED }, null), /excludedTrials/);
  assert.throws(() => Qn.validateQualification({ ...m, campaign: 'webgpu-remediation' }, null), /requires the authenticated qualification/);
  assert.doesNotThrow(() => Qn.validateQualification(m, null));
});

test('legacy: the committed webgpu-1 evidence loads, verifies and evaluates exactly as filed', async () => {
  const { manifest, records, attempts } = await Q.loadCampaign('docs/reports/project0/webgpu-1-manifest.json');
  assert.equal(manifest.qualification, undefined);
  const fixtures = await Q.loadFixtures(manifest);
  const { raws, errors } = await Q.recompute([...records, ...attempts], fixtures, { manifest, collect: true });
  assert.deepEqual(errors, {});
  const { backend } = Q.qualify(manifest, records, fixtures, { raws, attempts });
  const filed = JSON.parse(readFileSync(join(ROOT, 'docs/reports/project0/webgpu-1-gates.json'), 'utf8')).backend.gates;
  for (const g of GATES) assert.equal(backend.gates[g].status, filed[g].status, g);
});

// --- headed-only G1 -----------------------------------------------------------------------------------------------------------------------
test('E7 G1: valid headed evidence passes; missing, duplicate, invalid, uncorroborated, software or mode-mismatched evidence never passes', async () => {
  const ctx = await load();
  const verdict = rows => { const m = Q.buildManifest({ records: rows.filter((r, i, a) => a.findIndex(x => x.slot === r.slot) === i), ...base(ctx) }); return GC.evaluateGateChecked('G1', rows, m, fx, { raws: rawsOf(rows), qualification: ctx }); };
  const good = rec('G1', 'headed');
  assert.deepEqual(verdict([good]), { gate: 'G1', status: 'pass', reasons: [], evidenceIds: [good.id] });
  assert.equal(verdict([]).status, 'invalid/inconclusive');
  const dup = { ...good, id: 'G1-headed-other' };
  assert.equal(GC.evaluateGateChecked('G1', [good, dup], Q.buildManifest({ records: [good], ...base(ctx) }), fx, { raws: rawsOf([good, dup]), qualification: ctx }).status, 'invalid/inconclusive');
  assert.equal(verdict([rec('G1', 'headed', { invalidations: ['metrics: identity unavailable: x'] })]).status, 'invalid/inconclusive');
  assert.equal(verdict([rec('G1', 'headed', { metrics: { nvidia: 1, software: 0, corroborated: 0 } })]).status, 'fail');
  assert.equal(verdict([rec('G1', 'headed', { metrics: { nvidia: 0, software: 1, corroborated: 0 } })]).status, 'fail');
  const mismatch = rec('G1', 'headed', { identity: identity('headless') });
  assert.equal(GC.evaluateGateChecked('G1', [mismatch], { ...Q.buildManifest({ records: [], ...base(ctx) }), trials: { 'G1/headed': { id: mismatch.id, identity: mismatch.identity } } }, fx, { raws: rawsOf([mismatch]), qualification: ctx }).status, 'invalid/inconclusive');
  assert.equal(GC.evaluateGateChecked('G1', [good], Q.buildManifest({ records: [good], ...base(ctx) }), fx, { qualification: ctx }).status, 'invalid/inconclusive', 'timing evidence still required');
  assert.equal(GC.evaluateGateChecked('G1', [good], Q.buildManifest({ records: [good], ...base(ctx) }), fx, { raws: rawsOf([good]), qualification: { ...ctx } }).status, 'invalid/inconclusive', 'an unverified context never evaluates headed-only');
});

// --- exclusion semantics ------------------------------------------------------------------------------------------------------------------
test('E7: headless G1 cannot be selected, substituted, attempted or reported as passing; the exclusion is not a verdict and not notRun', async () => {
  const ctx = await load();
  const headless = rec('G1', 'headless', { identity: identity('headless') });
  assert.throws(() => Q.buildManifest({ records: [headless], ...base(ctx) }), /excluded under E7/);
  assert.throws(() => Q.buildManifest({ records: [rec('G4', 'bulb-samples', { identity: identity('headless') })], ...base(ctx) }), /headless/);
  const m = Q.buildManifest({ records: [rec('G1', 'headed')], ...base(ctx) });
  const smuggled = { ...m, trials: { ...m.trials, 'G1/headless': { id: headless.id, identity: headless.identity } } };
  assert.throws(() => Q.qualify(smuggled, [rec('G1', 'headed')], fx, { raws: rawsOf([rec('G1', 'headed')]), qualification: ctx }), /excluded under E7/);
  const attempt = rec('G1', 'incomplete', { identity: identity('headless'), invalidations: ['incomplete: the session produced no result'], metrics: {} });
  assert.throws(() => Q.buildManifest({ records: [], ...base(ctx), attempts: [attempt] }), /headless/);
  const { backend } = Q.qualify(m, [rec('G1', 'headed')], fx, { raws: rawsOf([rec('G1', 'headed')]), qualification: ctx });
  assert.equal(backend.gates.G1.status, 'pass');
  assert.ok(!('G1/headless' in backend.gates) && !Object.values(backend.gates).some(v => v.gate === 'G1/headless'));
  assert.equal(m.notRun.G1, undefined); assert.equal(m.trials['G1/headless'], undefined);
  assert.ok(!JSON.stringify(m.excludedTrials).includes('pass'));
  assert.throws(() => Q.qualify(m, [rec('G1', 'headed')], fx, { raws: rawsOf([rec('G1', 'headed')]) }), /verified qualification/, 'an E7 manifest is never evaluated without its context');
});

test('E7: the known limitation names the diagnosis record, the original webgpu-1 manifest and its headless record, bound by hash and verified', async () => {
  const ctx = await load();
  const lim = Qn.knownLimitationsOf(ctx);
  assert.equal(lim.length, 1);
  assert.equal(lim[0].id, 'g1-headless-gpu-process-crash');
  const refs = Object.fromEntries(lim[0].evidence.map(e => [e.kind, e]));
  assert.equal(refs.diagnosis.path, 'docs/reports/project0/webgpu-g1c-diagnosis.md');
  assert.equal(refs.manifest.path, 'docs/reports/project0/webgpu-1-manifest.json');
  assert.equal(refs.record.recordId, 'G1-headless-20261019T235719304Z-webgpu-1-g1-headless');
  for (const e of lim[0].evidence) assert.equal(e.sha256, sha(readFileSync(join(ROOT, e.kind === 'record' ? `artifacts/project0/${e.path}` : e.path))));
  await assert.doesNotReject(Qn.verifyKnownLimitations(ctx));
  const m = Q.buildManifest({ records: [], ...base(ctx) });
  assert.deepEqual(m.knownLimitations, lim);
  assert.throws(() => Qn.validateQualification({ ...m, knownLimitations: [] }, ctx), /knownLimitations/);
  const root = await scratch();
  try {
    for (const e of lim[0].evidence) { const p = e.kind === 'record' ? `artifacts/project0/${e.path}` : e.path; await mkdir(join(root, dirname(p)), { recursive: true }); await copyFile(join(ROOT, p), join(root, p)); }
    await writeFile(join(root, 'docs/reports/project0/webgpu-g1c-diagnosis.md'), 'edited');
    await assert.rejects(Qn.verifyKnownLimitations(ctx, { root }), /webgpu-g1c-diagnosis.md/, 'E7 does not excuse a corrupted reference');
  } finally { await rm(root, { recursive: true, force: true }); }
});

// --- decision integration -----------------------------------------------------------------------------------------------------------------
test('E7: with every effective gate passing, the unchanged decideBackends selects WebGPU; missing or invalid evidence still prevents it', async () => {
  const ctx = await load(), eff = Qn.effectiveGatePlan(fx, ctx);
  const all = Object.entries(eff).flatMap(([g, slots]) => Object.keys(slots).map(s => rec(g, s)));
  const m = Q.buildManifest({ records: all, ...base(ctx) });
  const { backend, decision } = Q.qualify(m, all, fx, { raws: rawsOf(all), qualification: ctx, remediationClosed: true });
  assert.deepEqual(GATES.filter(g => backend.gates[g].status !== 'pass'), []);
  assert.deepEqual(decision, decideBackends(backend)); assert.equal(decision.outcome, 'WebGPU selected');
  const less = all.filter(r => r.gate !== 'G8' || r.slot !== '0');
  assert.notEqual(Q.qualify(Q.buildManifest({ records: less, ...base(ctx) }), less, fx, { raws: rawsOf(less), qualification: ctx }).decision.outcome, 'WebGPU selected');
  const bad = all.map(r => (r.gate === 'G1' ? { ...r, invalidations: ['identity unavailable: x'] } : r));
  assert.notEqual(Q.qualify(Q.buildManifest({ records: bad, ...base(ctx) }), bad, fx, { raws: rawsOf(bad), qualification: ctx }).decision.outcome, 'WebGPU selected');
});

// --- campaign integration -----------------------------------------------------------------------------------------------------------------
const IMPL = { implementationCommit: 'd'.repeat(40), implementationHash: 'e'.repeat(64) };
const { evaluatePreflight } = await import('../integrity-preflight.mjs');
const pageLoad = () => ({ transport: 'p0Push', sameTaskRevert: { violations: ['unexpected backing 800x720 at 21'] }, undeliveredAtStop: { violations: ['unexpected backing 640x720 at 23'] },
  allowedResizes: { violations: [], events: [{ deliberate: true }, { deliberate: true }, { deliberate: true }] },
  statusVisibility: { position: 'fixed', offsetParentNull: true, visible: true, controls: { visibleFixed: true, displayNone: false, visibilityHidden: false, zeroSize: false, opacityZero: false, offscreen: false } } });
function preflightRecord(args) {   // the shape tests/t10.test.mjs uses: a passing seven-assertion preflight at IMPL with `args`
  const first = { slots: [{ raw: pageLoad() }] }, reload = { slots: [{ raw: pageLoad() }] };
  const { assertions } = evaluatePreflight({ first: first.slots[0].raw, reload: reload.slots[0].raw, evaluates: 0 });
  return { schema: 1, kind: 'integrity-preflight', pass: true, assertions, evaluates: 0, mode: 'headed', errors: [], implementation: IMPL,
    launch: { commandLine: `chrome ${args.join(' ')} --user-data-dir=/p`, profile: '/p', requestedArgs: [...args] }, first, reload };
}
function campaignDeps(over = {}) {
  const calls = [];
  const preflight = { pass: true, record: preflightRecord(['--enable-gpu']), runDir: '/x/pf' };
  const d = { LAUNCH: { remediation: ['--enable-gpu'] }, calls,
    runSession: async o => { calls.push(`session ${o.gate} ${o.mode}`); return { records: [], runDir: `/x/${o.gate}-${o.mode}` }; },
    runG2: async () => { calls.push('g2'); return { records: [], runDir: '/x/g2' }; },
    runPreflight: async () => { calls.push('preflight'); return preflight; },
    implementationIdentity: async () => IMPL, fixtureIdentity: async () => fixture, readFixtures: async () => fx,
    loadCampaign: async () => { throw new Error('none'); }, verifyPreflight: async () => {}, bindAuxiliary: async () => ({}),
    recompute: async records => ({ records, launches: [], raws: rawsOf(records), errors: {} }), writeReport: async (n, m, g) => { calls.push({ report: { m, g } }); }, log: () => {},
    loadQualification: id => Qn.loadQualification(id), verifyKnownLimitations: ctx => Qn.verifyKnownLimitations(ctx), ...over };
  return d;
}
test('campaign: webgpu-remediation requires the authenticated profile, validated before the preflight and any browser launch', async () => {
  const { runCampaign } = await import('../campaign.mjs');
  for (const values of [{ name: 'webgpu-remediation', args: 'remediation' }, { name: 'webgpu-remediation', args: 'remediation', qualification: 'project0-e7-headless-waiver' }]) {
    const d = campaignDeps();
    await assert.rejects(runCampaign(values, d), /qualification/);
    assert.deepEqual(d.calls, [], 'nothing launched');
  }
  const d = campaignDeps({ verifyKnownLimitations: async () => { throw new Error('webgpu-g1c-diagnosis.md does not match its pinned hash'); } });
  await assert.rejects(runCampaign({ name: 'webgpu-remediation', args: 'remediation', qualification: ID }, d), /pinned hash/);
  assert.deepEqual(d.calls, []);
});

test('campaign: under E7 no headless invocation is scheduled, every other invocation is requested headed, and the phases follow the headed verdicts', async () => {
  const { runCampaign, phasesFor, PHASES } = await import('../campaign.mjs');
  const ctx = await load();
  assert.deepEqual(phasesFor(null), PHASES, 'the legacy schedule is unchanged');
  const e7 = phasesFor(ctx).flatMap(([, steps]) => steps.map(s => s.join(' ')));
  assert.deepEqual(e7, PHASES.flatMap(([, steps]) => steps.map(s => s.join(' '))).filter(s => s !== 'G1 headless'));
  assert.ok(e7.every(s => s.endsWith(' headed')));
  // headed correctness passes: performance and stability run; no session is headless
  const correct = { 'G1 headed': [rec('G1', 'headed')], 'G4 headed': [rec('G4', 'bulb-samples')], 'G5 headed': [rec('G5', 'qjulia-plane'), rec('G5', 'qjulia-offplane')],
    'G3 headed': Object.keys(plan.G3).map(s => rec('G3', s)), 'G11 headed': [rec('G11', '4k')], 'G13 headed': ['intentional', 'injected', 'repeated'].map(s => rec('G13', s)) };
  const d = campaignDeps({ runSession: async o => { d.calls.push(`session ${o.gate} ${o.mode}`); return { records: correct[`${o.gate} ${o.mode}`] ?? [], runDir: `/x/${o.gate}-${o.mode}` }; } });
  const out = await runCampaign({ name: 'webgpu-remediation', args: 'remediation', qualification: ID }, d);
  const sessions = d.calls.filter(c => typeof c === 'string' && c.startsWith('session'));
  assert.ok(!sessions.some(s => s.includes('headless')), JSON.stringify(sessions));
  assert.ok(sessions.includes('session G8 headed') && sessions.includes('session G12 headed'), 'performance and stability ran after headed correctness passed');
  const report = d.calls.find(c => c.report).report;
  assert.deepEqual(report.m.qualification, REF); assert.deepEqual(report.m.excludedTrials, EXCLUDED); assert.equal(report.m.notRun.G1, undefined);
  assert.deepEqual(report.g.qualification, REF); assert.equal(report.g.scope, 'Qualification scope: headed execution only, under E7.');
  assert.equal(out.backend.gates.G1.status, 'pass');
  // a live stop still stops
  const stop = campaignDeps({ runSession: async o => { stop.calls.push(`session ${o.gate} ${o.mode}`); return { records: o.gate === 'G1' ? [rec('G1', 'headed', { invalidations: ['device lost: unknown'] })] : correct[`${o.gate} ${o.mode}`] ?? [], runDir: `/x/${o.gate}` }; } });
  await runCampaign({ name: 'webgpu-remediation', args: 'remediation', qualification: ID }, stop);
  assert.deepEqual(stop.calls.filter(c => typeof c === 'string' && c.startsWith('session')), ['session G1 headed']);
});

// --- round trip and frozen boundary -------------------------------------------------------------------------------------------------------
test('round trip: an E7 manifest reloads only with its authenticated profile; stripped or mismatched metadata is refused', async () => {
  const ctx = await load();
  const root = await scratch();
  try {
    const m = Q.buildManifest({ records: [], ...base(ctx), runDirs: [] });
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(join(root, 'docs/m.json'), JSON.stringify(m));
    await assert.rejects(Q.loadCampaign('docs/m.json', { root }), /verified qualification/);
    const loaded = await Q.loadCampaign('docs/m.json', { root, qualification: ctx });
    assert.deepEqual(loaded.manifest.qualification, REF);
    const { excludedTrials, ...stripped } = m; void excludedTrials;
    await writeFile(join(root, 'docs/s.json'), JSON.stringify(stripped));
    await assert.rejects(Q.loadCampaign('docs/s.json', { root, qualification: ctx }), /excludedTrials/);
    // closure itself is executed with captured writes in 'E7 r1-3' (fix round 1, finding 3), replacing a source-text check here
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('frozen boundary: the 24 sources, the governing specification and fixtures.json are byte-identical to the freeze', async () => {
  const fixtures = JSON.parse(await readFile(join(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
  const { execFileSync } = await import('node:child_process');
  const at = (c, p) => execFileSync('git', ['-C', ROOT, 'show', `${c}:${p}`], { maxBuffer: 256 * 1024 * 1024 });
  const p = fixtures.provenance;
  assert.equal(p.sources.length, 24); assert.deepEqual(p.sources.map(x => x.path), [...SOURCE_PATHS]);
  for (const x of p.sources) { assert.equal(sha(readFileSync(join(ROOT, x.path))), x.sha256, x.path); assert.ok(readFileSync(join(ROOT, x.path)).equals(at(p.generatorCommit, x.path)), x.path); }
  assert.equal(sha(readFileSync(join(ROOT, p.specPath))), p.specHash); assert.equal(p.specHash, AMENDMENT.baseSpecHash);
  assert.ok(readFileSync(join(ROOT, 'spikes/project0/fixtures.json')).equals(at('e3ee2c0', 'spikes/project0/fixtures.json')));
  assert.equal(sha(readFileSync(join(ROOT, 'spikes/project0/fixtures.json'))), AMENDMENT.fixtureHash);
});

// --- E7 fix round 1 (Codex run 20261020T044717Z-36ea) --------------------------------------------------------------------------------------
test('E7 r1-1: the checked evaluator binds the manifest to the context: a removed or zeroed reference, an extra exclusion, a legacy manifest or a missing context never pass', async () => {
  const ctx = await load(), good = rec('G1', 'headed');
  const m = Q.buildManifest({ records: [good], ...base(ctx) }), raws = rawsOf([good]);
  const ev = (man, q = ctx) => GC.evaluateGateChecked('G1', [good], man, fx, { raws, qualification: q });
  assert.equal(ev(m).status, 'pass');
  const { qualification: _drop, ...noRef } = m; void _drop;
  const cases = {
    'reference removed': noRef,
    'hash zeroed': { ...m, qualification: { ...m.qualification, sha256: '0'.repeat(64) } },
    'extra exclusion': { ...m, excludedTrials: { ...m.excludedTrials, 'G2/fresh-0': m.excludedTrials['G1/headless'] } },
    'legacy manifest': { fixture, campaign: 'webgpu-1', trials: m.trials },
  };
  for (const [name, man] of Object.entries(cases)) { const v = ev(man); assert.equal(v.status, 'invalid/inconclusive', name); assert.ok(v.reasons.some(r => /qualification|excludedTrials/.test(r)), `${name}: ${JSON.stringify(v.reasons)}`); }
  for (const gate of ['G4']) { const g4 = rec('G4', 'bulb-samples'); const mm = { ...Q.buildManifest({ records: [g4], ...base(ctx) }), qualification: undefined };
    assert.equal(GC.evaluateGateChecked(gate, [g4], mm, fx, { raws: rawsOf([g4]), qualification: ctx }).status, 'invalid/inconclusive', 'every gate is bound, not only G1'); }
  assert.equal(ev(m, null).status, 'invalid/inconclusive', 'an E7 manifest without its context');
  const legacy = { fixture, campaign: 'webgpu-1', trials: { 'G4/bulb-samples': { id: rec('G4', 'bulb-samples').id, identity: identity('headed') } } };
  const g4 = rec('G4', 'bulb-samples', { campaign: 'webgpu-1' });
  assert.equal(GC.evaluateGateChecked('G4', [g4], legacy, fx, { raws: rawsOf([g4]) }).status, 'pass', 'ordinary legacy evaluation without a profile is preserved');
});

test('E7 r1-2: the authenticated amendment is deeply immutable; only G1/headless can ever be removed', async () => {
  const ctx = await load();
  assert.throws(() => ctx.doc.excludedRequiredSlots.push('G2/fresh-0'), TypeError);
  assert.throws(() => { ctx.doc.authority.decision = 'unapproved'; }, TypeError);
  assert.throws(() => { ctx.doc.preregistration.sha256 = '0'.repeat(64); }, TypeError);
  assert.throws(() => { ctx.doc.excludedRequiredSlots[0] = 'G2/fresh-0'; }, TypeError);
  assert.deepEqual([...ctx.doc.excludedRequiredSlots], ['G1/headless']); assert.equal(ctx.doc.authority.decision, 'E7');
  const plan = Qn.effectiveGatePlan(fx, ctx), frozen = gatePlan(fx); delete frozen.G1.headless;
  assert.equal(canonical(plan), canonical(frozen));
  assert.deepEqual(Q.buildManifest({ records: [], ...base(ctx) }).excludedTrials, EXCLUDED);
});

test('E7 r1-3: closure executes with controlled reads and captured writes: the decision carries the reference, exclusions, limitations and manifest hash; stripped or mismatched metadata is refused', async () => {
  const { closeRemediation } = await import('../close-remediation.mjs');
  const ctx = await load(), root = await scratch();
  try {
    const m = Q.buildManifest({ records: [], ...base(ctx), runDirs: [] });
    await mkdir(join(root, 'docs'), { recursive: true });
    const history = '# h\n\n## Classification\nx\n\n## Change set\ny\n';
    await writeFile(join(root, 'docs/h.md'), history);
    const put = async (name, value) => { const text = JSON.stringify(value); await writeFile(join(root, `docs/${name}`), text); return text; };
    const text = await put('m.json', m);
    const writes = [];
    const deps = { root, loadFixtures: async () => fx, verifyPreflight: async () => {}, writeFile: async (path, data) => { writes.push({ path, data }); }, log: () => {} };
    await closeRemediation({ manifest: 'docs/m.json', history: 'docs/h.md' }, deps);
    assert.equal(writes.length, 1); assert.ok(writes[0].path.endsWith('docs/reports/project0/webgpu-decision.json'));
    const out = JSON.parse(writes[0].data);
    assert.deepEqual(out.qualification, REF); assert.deepEqual(out.excludedTrials, EXCLUDED); assert.deepEqual(out.knownLimitations, Qn.knownLimitationsOf(ctx));
    assert.equal(out.scope, 'Qualification scope: headed execution only, under E7.'); assert.equal(out.manifestSha256, sha(text)); assert.equal(out.historySha256, sha(history));
    assert.ok(!('G1/headless' in out.gates)); assert.notEqual(out.decision.outcome, 'WebGPU selected');
    const { excludedTrials, ...stripped } = m; void excludedTrials;
    await put('s.json', stripped);
    await assert.rejects(closeRemediation({ manifest: 'docs/s.json', history: 'docs/h.md' }, deps), /excludedTrials/);
    await put('x.json', { ...m, qualification: { ...m.qualification, sha256: '0'.repeat(64) } });
    await assert.rejects(closeRemediation({ manifest: 'docs/x.json', history: 'docs/h.md' }, deps), /qualification reference/);
    await put('l.json', { ...m, knownLimitations: [] });
    await assert.rejects(closeRemediation({ manifest: 'docs/l.json', history: 'docs/h.md' }, deps), /knownLimitations/);
    assert.equal(writes.length, 1, 'a refused closure writes no decision');
  } finally { await rm(root, { recursive: true, force: true }); }
});
