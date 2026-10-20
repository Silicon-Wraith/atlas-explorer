// spikes/project0/tests/g5d-qualification.test.mjs — G5-D preregistration §9 items 5–13: the authenticated amendment profile project0-g5d-v1,
// the effective plan and checked evaluation, legacy preservation, evidence collection (writer to reader and closure), shader identity and
// construction (current and historical), S3 as a non-gating diagnostic, the campaign's fixed request, closure to a separate decision file, the
// frozen boundary, and offline WGSL validation. No test launches a browser or requests a GPU: the campaign and the page collector run only with
// injected fakes; filesystem fixtures live under artifacts/runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm, readFile, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT, DEVELOPER_FLAG } from '../launch.mjs';
import { canonical, GATES } from '../contract.js';
import { gatePlan, evaluateGate } from '../gates.js';
import { EXPECTED_TIMING } from '../timing-contract.js';
import { decideBackends } from '../decision.js';
import { SOURCE_PATHS } from '../fixture-files.mjs';
import { launchIdentity } from '../evidence.mjs';
import { fx, gpuRaw, planeWords, committedMatrix } from './g5d-helpers.mjs';

const imp = p => import(p).catch(e => ({ __missing: e.message }));
const Qn = await import('../qualification.mjs');
const Q = await import('../qualify.mjs');
const GC = await import('../gates-checked.js');
const Mt = await imp('../qualification/g5d-metrics.mjs');
const Cf = await imp('../qualification/g5d-config.js');
const Col = await imp('../qualification/g5d-collect.js');
const Pf = await imp('../qualification/g5d-profile.mjs');
const V = await import('../remediation/validate.mjs');
const ER = await import('../remediation/evidence-rules.mjs');
const need = (...mods) => { for (const m of mods) assert.equal(m.__missing, undefined, m.__missing); };
const sha = b => createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { maxBuffer: 256 * 1024 * 1024 });

const ID = 'project0-g5d-v1', PATH = 'spikes/project0/qualification/g5d-v1.json', E7 = 'project0-e7-headed-v1';
const E7_ENTRY = { path: 'spikes/project0/qualification/e7-headed-v1.json', sha256: '99ea9a3030fd31f68a3cb39cc97b10227fd28afdfc38e55a82119618991d8c51' };
const PREREG = { path: 'docs/reports/project0/webgpu-g5d-prereg.md', sha256: 'f02888b4196452615d71c0345b55a0d6a4171825224e1dbd26323dbb0401b172' };
const BASE = { specHash: '64d82abf00e50c97c72347d7f4fa2d7b9dfd86240e73441b099a31afc8b1c645', fixtureHash: 'ab15af0e527e60168b9cffc6328dadfd0846430da416ba06334fe041907ba0d1' };
const FRAGMENT = '290b4cc6ef4a608da0e44f3cdafb0ed52943e3c37aee9292167fb24a5a90a78c';
const HISTORY = {
  'docs/reports/project0/webgpu-1-manifest.json': 'd733e85046a39d64d7fefe7f50ff0c39d822b0ca0ae69fe9ec92b8fbb7c9dfdd',
  'docs/reports/project0/webgpu-remediation-manifest.json': 'b0026a0bc85b3d1f4c0e6d97de37bb3c3a4fe71c8c5391ce8185d555ba9fab64',
  'docs/reports/project0/webgpu-decision.json': 'c36410a2b1ddb16489087dc81ee9bb99ac45d9bcd2276cde988ed9aa545494ad',
};
const RECORDS = { 'webgpu-1': '7bda8368b6449105945d1ced07a6c76cfc38b76a5ad8fde524898423ce96b87c', 'webgpu-remediation': '1023ae9e0fbbb8656e7f46313f0a9ffd63a22382769b3e7b31c379ad26a84d3f' };
const G5A = { implementationCommit: '448d5ff5eed70af1fbc579488d1f238cb155d3be', sha256: '58a506b905061e195be1ad22a4d39370a9db7082ebc068e318420b785a2388ea' };
const RULES = { samples: ['eq', 287], qualifying: ['eq', 223], diagnostics: ['eq', 64], components: ['eq', 19108], statusErrors: ['eq', 0], indexErrors: ['eq', 0], numericalFailures: ['eq', 0], componentRatio: ['range', 0, 1], logRRatio: ['range', 0, 1] };
const fixture = { fixtureHash: BASE.fixtureHash, fixtureCommit: '5638678f5752ce4c6a40f36b280e1ce13ed52480', specHash: BASE.specHash };
const identity = mode => ({ backend: 'webgpu', ...fixture, implementationCommit: 'd'.repeat(40), implementationHash: 'e'.repeat(64), launchHash: 'f'.repeat(64), browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's', mode });
const load = () => Qn.loadQualification(ID);
let effective = null;
const effPlan = async () => (effective ??= Qn.effectiveGatePlan(fx, await load()));
const rec = (gate, slot, extra = {}, plan = effective) => ({ schema: 1, id: `${gate}-${slot.replace(/[^A-Za-z0-9.-]/g, '_')}-run`, gate, slot, campaign: 'webgpu-g5d', experiment: false, identity: identity('headed'),
  invalidations: [], artifacts: [{ path: 'r/x.raw.json', sha256: '0'.repeat(64) }], metrics: Object.fromEntries(Object.entries(plan?.[gate]?.[slot] ?? {}).map(([k, [, a]]) => [k, a])), timingMethod: EXPECTED_TIMING[gate][0], ...extra });
const rawsOf = rs => Object.fromEntries(rs.map(r => [r.id, r.timingMethod?.field ? { [r.timingMethod.field]: 1 } : {}]));
const base = ctx => ({ fixture, campaign: 'webgpu-g5d', args: 'remediation', requestedArgs: ['--enable-gpu'], qualification: ctx });
async function scratch() { const dir = resolve(ROOT, 'artifacts/runtime'); await mkdir(dir, { recursive: true }); return mkdtemp(join(dir, 'p0-g5d-')); }
async function copyTree(root, paths) { for (const p of paths) { await mkdir(join(root, dirname(p)), { recursive: true }); await copyFile(join(ROOT, p), join(root, p)); } }
const allEffective = async () => { const eff = await effPlan(); return Object.entries(eff).flatMap(([g, slots]) => Object.keys(slots).map(s => rec(g, s))); };

// --- §9.5 profile integrity ---------------------------------------------------------------------------------------------------------------
test('G5D-9.5: the committed profile is exactly the built object, canonically serialised and pinned in the registry beside the unchanged E7 entry', async () => {
  need(Pf);
  const bytes = readFileSync(join(ROOT, PATH), 'utf8');
  assert.equal(bytes, canonical(await Pf.buildProfile()) + '\n');
  assert.deepEqual(Object.keys(Qn.QUALIFICATIONS).sort(), [E7, ID]);
  assert.deepEqual(Qn.QUALIFICATIONS[E7], E7_ENTRY, 'the E7 entry is unchanged');
  assert.deepEqual(Qn.QUALIFICATIONS[ID], { path: PATH, sha256: sha(bytes) });
  assert.deepEqual(Qn.REQUIRED_PROFILE_CAMPAIGNS, { 'webgpu-remediation': E7, 'webgpu-g5d': ID });
  const ctx = await load(), d = ctx.doc;
  assert.equal(Qn.isVerifiedQualification(ctx), true);
  assert.deepEqual([d.id, d.campaign, d.backend, d.executionMode], [ID, 'webgpu-g5d', 'webgpu', 'headed']);
  assert.deepEqual(d.authority.decisions, ['E7', 'E8', 'E9']);
  assert.deepEqual(d.preregistration, { ...PREREG, commit: '9c59e51c7025c945eec3ebbf6c0b1b138100a29d' });
  assert.ok(git('show', `${d.preregistration.commit}:${PREREG.path}`).equals(readFileSync(join(ROOT, PREREG.path))), 'the bound preregistration is the committed revised document');
  assert.deepEqual([d.baseSpecHash, d.fixtureHash], [BASE.specHash, BASE.fixtureHash]);
  assert.deepEqual(d.excludedRequiredSlots, ['G1/headless', 'G5/qjulia-offplane']);
  assert.deepEqual(Object.keys(d.addedSlots), ['G5/qjulia-operational']);
  assert.deepEqual(d.addedSlots['G5/qjulia-operational'].rules, RULES);
  assert.equal(d.addedSlots['G5/qjulia-operational'].replaces, 'G5/qjulia-offplane');
  assert.equal(d.kernel.fragmentSha256, FRAGMENT);
  assert.equal(d.artifacts.matrix.sha256, 'b74ecc9e404ace915fe59fd7e4ea0acb097743157e376bff2edf45f19663c96e');
  for (const [k, a] of Object.entries(d.artifacts)) assert.equal(sha(readFileSync(join(ROOT, a.path))), a.sha256, k);
  for (const m of d.kernel.shader.modules) assert.equal(sha(readFileSync(join(ROOT, m.path))), m.sha256, m.path);
  assert.equal(d.kernel.shader.sha256, sha(Buffer.concat(d.kernel.shader.modules.map(m => readFileSync(join(ROOT, m.path))))));
  assert.deepEqual(Object.fromEntries(d.historical.files.map(f => [f.path, f.sha256])), HISTORY);
  assert.deepEqual(Object.fromEntries(d.historical.offplaneRecords.map(r => [r.campaign, r.sha256])), RECORDS);
  assert.deepEqual([d.historical.g5a.implementationCommit, d.historical.g5a.shader.sha256], [G5A.implementationCommit, G5A.sha256]);
  assert.deepEqual(d.knownLimitations, Qn.knownLimitationsOf(await Qn.loadQualification(E7)), 'the existing E7 limitation evidence is inherited unchanged');
  assert.deepEqual(d.launch.requestedArgs, JSON.parse(readFileSync(join(ROOT, 'spikes/project0/launch-remediation.json'), 'utf8')));
});

test('G5D-9.5: missing, altered, unhashed, unknown or noncanonical profiles and altered bound files fail closed', async () => {
  const ctx = await load();
  await assert.rejects(Qn.loadQualification('project0-g5d-v2'), /unknown qualification/);
  const root = await scratch();
  try {
    await assert.rejects(Qn.loadQualification(ID, { root }), /cannot be read/);
    const files = [PATH, ...Qn.pinnedFilesOf(ctx).map(f => f.path)];
    assert.ok(files.includes(PREREG.path) && files.includes('spikes/project0/qualification/g5d-matrix.json') && files.includes('spikes/project0/gpu/arithmetic.wgsl'));
    await copyTree(root, files);
    assert.ok(Qn.isVerifiedQualification(await Qn.loadQualification(ID, { root })));
    const doc = JSON.parse(readFileSync(join(ROOT, PATH), 'utf8'));
    await writeFile(join(root, PATH), canonical({ ...doc, excludedRequiredSlots: [...doc.excludedRequiredSlots, 'G2/fresh-0'] }) + '\n');
    await assert.rejects(Qn.loadQualification(ID, { root }), /pinned hash/);
    await writeFile(join(root, PATH), JSON.stringify(doc, null, 2));
    await assert.rejects(Qn.loadQualification(ID, { root }), /pinned hash/);
    await copyFile(join(ROOT, PATH), join(root, PATH));
    await writeFile(join(root, 'spikes/project0/qualification/g5d-matrix.json'), '{}\n');
    await assert.rejects(Qn.loadQualification(ID, { root }), /g5d-matrix\.json/);
    await copyFile(join(ROOT, 'spikes/project0/qualification/g5d-matrix.json'), join(root, 'spikes/project0/qualification/g5d-matrix.json'));
    await writeFile(join(root, 'spikes/project0/gpu/arithmetic.wgsl'), readFileSync(join(ROOT, 'spikes/project0/gpu/arithmetic.wgsl'), 'utf8').replace('qsq(q) + c', 'qsq(q) - c'));
    await assert.rejects(Qn.loadQualification(ID, { root }), /arithmetic\.wgsl/);
    await copyFile(join(ROOT, 'spikes/project0/gpu/arithmetic.wgsl'), join(root, 'spikes/project0/gpu/arithmetic.wgsl'));
    await writeFile(join(root, PREREG.path), 'edited');
    await assert.rejects(Qn.loadQualification(ID, { root }), /preregistration/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('G5D-9.5: the effective plan removes only G1/headless and G5/qjulia-offplane and injects only G5/qjulia-operational; no other slot can be excluded or injected', async () => {
  const ctx = await load(), eff = Qn.effectiveGatePlan(fx, ctx), frozen = gatePlan(fx);
  delete frozen.G1.headless; delete frozen.G5['qjulia-offplane']; frozen.G5['qjulia-operational'] = RULES;
  assert.equal(canonical(eff), canonical(frozen));
  assert.ok(gatePlan(fx).G5['qjulia-offplane'] && !gatePlan(fx).G5['qjulia-operational'], 'the frozen plan is untouched');
  const e7 = await Qn.loadQualification(E7), e7plan = gatePlan(fx); delete e7plan.G1.headless;
  assert.equal(canonical(Qn.effectiveGatePlan(fx, e7)), canonical(e7plan), 'E7 still removes only G1/headless and injects nothing');
  const m = Q.buildManifest({ records: [], ...base(ctx) });
  assert.deepEqual(Object.keys(m.excludedTrials).sort(), ['G1/headless', 'G5/qjulia-offplane']);
  assert.deepEqual(m.excludedTrials['G1/headless'], { disposition: 'not-required', authority: 'E7', collection: 'not-scheduled-in-this-campaign', summary: 'not required under E7; prior failure retained' });
  assert.deepEqual(m.excludedTrials['G5/qjulia-offplane'], { disposition: 'diagnostic', authority: 'E8', collection: 'freshly-collected-in-G5/qjulia-operational', summary: 'diagnostic under E8; freshly collected; not a qualifying pass' });
  for (const extra of [{ ...m.excludedTrials, 'G2/fresh-0': m.excludedTrials['G1/headless'] }, { 'G1/headless': m.excludedTrials['G1/headless'] }, { ...m.excludedTrials, 'G5/qjulia-offplane': { ...m.excludedTrials['G5/qjulia-offplane'], disposition: 'pass' } }])
    assert.throws(() => Qn.validateQualification({ ...m, excludedTrials: extra }, ctx), /excludedTrials/);
  const offplane = rec('G5', 'qjulia-offplane', { metrics: { components: 32, componentRatio: 0.5 } });
  assert.throws(() => Q.buildManifest({ records: [offplane], ...base(ctx) }), /excluded under E8/);
  const other = rec('G5', 'qjulia-continuation', { metrics: {} });
  const all = await allEffective();
  assert.throws(() => Q.qualify(Q.buildManifest({ records: [...all, other], ...base(ctx) }), [...all, other], fx, { raws: rawsOf([...all, other]), qualification: ctx }), /unknown slot/);
});

test('G5D-9.5: nested authenticated data is immutable; stripped or mismatched manifest metadata and direct evaluator calls without the context never evaluate', async () => {
  const ctx = await load();
  assert.throws(() => { ctx.doc.addedSlots['G5/qjulia-operational'].rules.componentRatio[2] = 5; }, TypeError);
  assert.throws(() => { ctx.doc.kernel.shader.sha256 = '0'.repeat(64); }, TypeError);
  assert.throws(() => ctx.doc.excludedRequiredSlots.push('G2/fresh-0'), TypeError);
  assert.throws(() => { ctx.doc.artifacts.matrix.sha256 = '0'.repeat(64); }, TypeError);
  const all = await allEffective(), m = Q.buildManifest({ records: all, ...base(ctx) }), raws = rawsOf(all);
  const g5 = all.filter(r => r.gate === 'G5');
  assert.equal(GC.evaluateGateChecked('G5', g5, m, fx, { raws, qualification: ctx }).status, 'pass');
  assert.equal(GC.evaluateGateChecked('G5', g5, m, fx, { raws }).status, 'invalid/inconclusive', 'no context');
  assert.equal(GC.evaluateGateChecked('G5', g5, m, fx, { raws, qualification: { ...ctx } }).status, 'invalid/inconclusive', 'an unverified copy');
  const e7 = await Qn.loadQualification(E7);
  assert.equal(GC.evaluateGateChecked('G5', g5, m, fx, { raws, qualification: e7 }).status, 'invalid/inconclusive', 'the E7 context does not bind a G5-D manifest');
  const { excludedTrials, ...stripped } = m; void excludedTrials;
  const { qualification: _q, ...noRef } = m; void _q;
  for (const [name, man] of Object.entries({ stripped, noRef, zeroed: { ...m, qualification: { ...m.qualification, sha256: '0'.repeat(64) } }, e7ref: { ...m, qualification: Qn.qualificationReference(e7) }, limits: { ...m, knownLimitations: [] } }))
    assert.equal(GC.evaluateGateChecked('G5', g5, man, fx, { raws, qualification: ctx }).status, 'invalid/inconclusive', name);
  await assert.rejects(Promise.resolve().then(() => Q.qualify(m, all, fx, { raws })), /verified qualification/);
});

test('G5D-8.3 regression: a selected operational G5 record never invalidates otherwise valid G2/G4 evidence through an unknown-slot error', async () => {
  const ctx = await load(), all = await allEffective(), m = Q.buildManifest({ records: all, ...base(ctx) }), raws = rawsOf(all);
  assert.equal(evaluateGate('G2', all, m, fx).status, 'invalid/inconclusive', 'why: the frozen evaluator validates every record against the frozen plan');
  for (const g of GATES) assert.equal(GC.evaluateGateChecked(g, all, m, fx, { raws, qualification: ctx }).status, 'pass', g);
  const { backend, decision } = Q.qualify(m, all, fx, { raws, qualification: ctx, remediationClosed: true });
  assert.deepEqual(GATES.filter(g => backend.gates[g].status !== 'pass'), []);
  assert.deepEqual(decision, decideBackends(backend)); assert.equal(decision.outcome, 'WebGPU selected');
  const failing = all.map(r => (r.slot === 'qjulia-operational' ? { ...r, metrics: { ...r.metrics, numericalFailures: 1 } } : r));
  const v = Q.qualify(Q.buildManifest({ records: failing, ...base(ctx) }), failing, fx, { raws: rawsOf(failing), qualification: ctx });
  assert.equal(v.backend.gates.G5.status, 'fail'); assert.deepEqual(v.backend.gates.G5.reasons, ['qjulia-operational: numericalFailures=1']);
  const noOp = all.filter(r => r.slot !== 'qjulia-operational');
  assert.equal(Q.qualify(Q.buildManifest({ records: noOp, ...base(ctx) }), noOp, fx, { raws: rawsOf(noOp), qualification: ctx }).backend.gates.G5.status, 'invalid/inconclusive');
});

// --- §9.6 legacy preservation -------------------------------------------------------------------------------------------------------------
test('G5D-9.6: webgpu-1 and webgpu-remediation recompute exactly as filed under their own rules; G5-D can never reinterpret the original G5', async () => {
  const one = await Q.loadCampaign('docs/reports/project0/webgpu-1-manifest.json');
  const f1 = await Q.loadFixtures(one.manifest);
  const r1 = await Q.recompute([...one.records, ...one.attempts], f1, { manifest: one.manifest, collect: true });
  assert.deepEqual(r1.errors, {});
  const off1 = Object.values(r1.g5Observations).find(o => o.slot === 'qjulia-offplane');
  assert.equal(off1.componentRatio, 2.7497713106862958); assert.equal(off1.numericalFailure, true);
  const g1 = Q.qualify(one.manifest, one.records, f1, { raws: r1.raws, attempts: one.attempts }).backend.gates;
  const filed1 = JSON.parse(readFileSync(join(ROOT, 'docs/reports/project0/webgpu-1-gates.json'), 'utf8')).backend.gates;
  for (const g of GATES) assert.equal(g1[g].status, filed1[g].status, `webgpu-1 ${g}`);
  assert.equal(g1.G5.status, 'fail');
  const e7 = await Qn.loadQualification(E7);
  const rem = await Q.loadCampaign('docs/reports/project0/webgpu-remediation-manifest.json', { qualification: e7 });
  const f2 = await Q.loadFixtures(rem.manifest);
  const r2 = await Q.recompute([...rem.records, ...rem.attempts], f2, { manifest: rem.manifest, collect: true, baseline: await Q.loadBaseline(), qualification: e7 });
  assert.deepEqual(r2.errors, {}, 'the historical G5-A record verifies against its own recorded implementation');
  const off2 = Object.values(r2.g5Observations).find(o => o.slot === 'qjulia-offplane');
  assert.equal(off2.componentRatio, 4.744852004194964); assert.equal(off2.numericalFailure, true);
  assert.equal(off2.compensation.validated, false); assert.deepEqual(off2.compensation.matches, []);
  assert.ok(!off2.compensation.problems.some(p => /shader/.test(p)), 'no shader-identity problem: the record is checked against 448d5ff, not the new checkout');
  const g2 = Q.qualify(rem.manifest, rem.records, f2, { raws: r2.raws, attempts: rem.attempts, qualification: e7 }).backend.gates;
  const filed2 = JSON.parse(readFileSync(join(ROOT, 'docs/reports/project0/webgpu-remediation-gates.json'), 'utf8')).backend.gates;
  for (const g of GATES) assert.equal(g2[g].status, filed2[g].status, `webgpu-remediation ${g}`);
  assert.equal(g2.G5.status, 'invalid/inconclusive');
  const ctx = await load();
  await assert.rejects(Q.loadCampaign('docs/reports/project0/webgpu-remediation-manifest.json', { qualification: ctx }), /qualification/);
  await assert.rejects(Q.loadCampaign('docs/reports/project0/webgpu-1-manifest.json', { qualification: ctx }), /qualification/);
  assert.throws(() => Q.qualify(one.manifest, one.records, f1, { raws: r1.raws, attempts: one.attempts, qualification: ctx }), /qualification/);
  assert.equal(sha(readFileSync(join(ROOT, 'docs/reports/project0/webgpu-decision.json'))), HISTORY['docs/reports/project0/webgpu-decision.json']);
});

test('G5D-8.6: the historical references verify through their authenticated manifests and keep their original results', async () => {
  const ctx = await load();
  const h = await Qn.verifyHistoricalReferences(ctx);
  assert.deepEqual(h.offplane.map(o => [o.campaign, o.sha256, o.componentRatio, o.numericalFailure]),
    [['webgpu-1', RECORDS['webgpu-1'], 2.7497713106862958, true], ['webgpu-remediation', RECORDS['webgpu-remediation'], 4.744852004194964, true]]);
  assert.deepEqual(h.outcomes, { 'webgpu-1': { G5: 'fail' }, 'webgpu-remediation': { G5: 'invalid/inconclusive', compensation: 'unvalidated', matches: [] }, decision: 'inconclusive' });
  const root = await scratch();
  try {
    const files = ctx.doc.historical.files.map(f => f.path);
    await copyTree(root, files);
    await writeFile(join(root, 'docs/reports/project0/webgpu-decision.json'), '{}');
    await assert.rejects(Qn.verifyHistoricalReferences(ctx, { root }), /webgpu-decision\.json/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// --- §9.8 shader identity and construction ------------------------------------------------------------------------------------------------
const fieldsSrc = () => readFileSync(join(ROOT, 'spikes/project0/gpu/fields.wgsl'), 'utf8');
const arithSrc = () => readFileSync(join(ROOT, 'spikes/project0/gpu/arithmetic.wgsl'), 'utf8');
const body = (src, name) => { const i = src.indexOf(`fn ${name}(`); assert.ok(i >= 0, `fn ${name}`); let depth = 0; const j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') depth++; if (src[k] === '}' && --depth === 0) return src.slice(j + 1, k).replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim(); } return null; };

test('G5D-9.8: fields.wgsl is unchanged; the concatenated module declares qsq once; the logical fragment hash matches; every G5 path calls the one wrapper', () => {
  const fields = fieldsSrc(), arith = arithSrc(), code = fields + arith;
  assert.ok(Buffer.from(fields).equals(git('show', '9c59e51:spikes/project0/gpu/fields.wgsl')), 'fields.wgsl is byte-identical to the preregistration commit');
  assert.equal((code.match(/\bfn qsq\(/g) ?? []).length, 1); assert.equal((code.match(/\bfn q_update_g5d\(/g) ?? []).length, 1);
  const lines = fields.split('\n'), al = arith.split('\n'), w = al.findIndex(l => l.startsWith('fn q_update_g5d('));
  assert.equal(sha(lines.slice(51, 54).join('\n') + '\n' + al.slice(w, w + 3).join('\n') + '\n'), FRAGMENT);
  assert.deepEqual(al.slice(w, w + 3), ['fn q_update_g5d(q: vec4f, c: vec4f) -> vec4f {', '  return qsq(q) + c;', '}']);
  for (const e of ['qjulia_plane', 'qjulia_offplane', 'qjulia_operational']) {
    const b = body(arith, e);
    assert.ok(b.includes('q = q_update_g5d(q, c);'), e); assert.ok(!/q_update\(/.test(b), `${e} no longer uses the G5-A update`);
  }
  assert.ok(body(arith, 'qjulia_plane').includes('if (r > 2.0) { out = vec4u(ST_ESCAPED, n, bitcast<u32>(log(r)), 0u); break; }'), 'the plane escape test is unchanged');
  const op = body(arith, 'qjulia_operational');
  assert.ok(!/2\.0/.test(op), 'the operational radius is a runtime input, never a constant'); assert.ok(/inputs\[/.test(op) && /count\.cap/.test(op));
  assert.equal(body(fields, 'bulb_eval'), body(git('show', '9c59e51:spikes/project0/gpu/fields.wgsl').toString(), 'bulb_eval'));
  assert.equal(body(arith, 'bulb_samples'), body(git('show', '9c59e51:spikes/project0/gpu/arithmetic.wgsl').toString(), 'bulb_samples'), 'G4 is untouched');
  const before = git('show', '9c59e51:spikes/project0/gpu/arithmetic.wgsl').toString();
  for (const f of ['two_product_fma', 'two_sum', 'dot2_step', 'q_update', 'derivative_policy', 'remediation_primitives', 'remediation_dot', 'remediation_updates']) assert.equal(body(arith, f), body(before, f), f);
});

test('G5D-9.8: the current G5-D shader identity is the reviewed source and descriptors; wrong hash, altered constants, duplicate, missing or extra descriptors and the wrong form are evidence defects', async () => {
  need(Mt, Cf);
  const ctx = await load(), want = Mt.expectedG5dShader();
  assert.equal(want.sha256, sha(fieldsSrc() + arithSrc())); assert.equal(want.sha256, ctx.doc.kernel.shader.sha256);
  assert.deepEqual(want.entryPoints, [...(await import('../remediation/pipeline-config.js')).ARITHMETIC_ENTRY_POINTS]);
  assert.ok(want.entryPoints.includes('qjulia_operational'));
  assert.deepEqual(want, { sha256: ctx.doc.kernel.shader.sha256, entryPoints: [...ctx.doc.kernel.shader.entryPoints], pipelines: JSON.parse(JSON.stringify(ctx.doc.kernel.shader.pipelines)) });
  const m = committedMatrix(), good = gpuRaw(m, 'F');
  assert.doesNotThrow(() => Mt.operationalMetrics(good, fx));
  const defect = (raw, re) => assert.throws(() => Mt.operationalMetrics(raw, fx), e => e.invalidation === true && re.test(e.message), re.source);
  defect({ ...good, shader: { ...good.shader, sha256: '0'.repeat(64) } }, /shader/);
  defect({ ...good, shader: { ...good.shader, sha256: G5A.sha256 } }, /shader/);
  defect({ ...good, shader: { ...good.shader, pipelines: good.shader.pipelines.map(p => (p.entryPoint === 'qjulia_operational' ? { ...p, constants: { RADIUS: 2 } } : p)) } }, /pipeline/);
  defect({ ...good, shader: { ...good.shader, pipelines: [...good.shader.pipelines, good.shader.pipelines[0]] } }, /pipeline/);
  defect({ ...good, shader: { ...good.shader, pipelines: good.shader.pipelines.slice(1) } }, /pipeline/);
  defect({ ...good, shader: { ...good.shader, entryPoints: [...good.shader.entryPoints, 'qjulia_extra'] } }, /entry points/);
  defect({ ...good, form: 'g5a-compensated-dot2-prereg-rev2' }, /form/);
  defect({ ...good, matrix: { ...good.matrix, sha256: '1'.repeat(64) } }, /matrix/);
  defect({ ...good, layout: { ...good.layout, batch: 32 } }, /layout/);
});

test('G5D-8.5: historical G5-A evidence is checked against its recorded implementation, never the new checkout, and never by its own self-declared hash', () => {
  const hist = (git('show', '448d5ff:spikes/project0/gpu/fields.wgsl').toString() + git('show', '448d5ff:spikes/project0/gpu/arithmetic.wgsl').toString());
  assert.equal(sha(hist), G5A.sha256);
  const raw = JSON.parse(readFileSync(join(ROOT, 'artifacts/project0/20261020T051013812Z-webgpu-remediation-g5-headed/G5-qjulia-offplane-20261020T051013812Z-webgpu-remediation-g5-headed.raw.json'), 'utf8'));
  const record = JSON.parse(readFileSync(join(ROOT, 'artifacts/project0/20261020T051013812Z-webgpu-remediation-g5-headed/G5-qjulia-offplane-20261020T051013812Z-webgpu-remediation-g5-headed.json'), 'utf8'));
  const histExpect = V.expectedShader(record.identity);
  assert.equal(histExpect.sha256, G5A.sha256); assert.equal(histExpect.entryPoints.length, 7); assert.ok(!histExpect.entryPoints.includes('qjulia_operational'));
  assert.ok(!V.compensationReport(raw, fx, undefined, { identity: record.identity }).problems.some(p => /shader/.test(p)));
  assert.ok(V.compensationReport(raw, fx).problems.some(p => /shader source hash/.test(p)), 'against the current checkout it is a mismatch');
  assert.ok(V.compensationReport(raw, fx, undefined, { identity: { ...record.identity, implementationHash: '0'.repeat(64) } }).problems.some(p => /shader source hash/.test(p)), 'a commit alone does not select the historical expectation');
  assert.equal(V.expectedShader().sha256, sha(fieldsSrc() + arithSrc()));
});

// --- §9.7 evidence collection -------------------------------------------------------------------------------------------------------------
const planeU32 = () => new Uint32Array(planeWords());
function collectorDeps(raw, { failAt = null } = {}) {
  const words = n => Uint32Array.from(raw.batches.find(b => b.start === n).words);
  const boom = where => { throw new Error(`harness readback timeout: ${where}`); };
  return {
    plane: async () => (failAt === 'plane' ? boom('plane') : planeU32()),
    shader: async () => (failAt === 'shader' ? boom('shader') : raw.shader),
    matrix: async () => ({ sha256: raw.matrix.sha256, cases: committedMatrix().cases }),
    continuation: async () => (failAt === 'continuation' ? boom('continuation') : Uint32Array.from(raw.continuation.words)),
    batch: async (inputs, count, start) => { if (failAt === `batch${start}`) boom(`batch ${start}`); assert.equal(inputs.length, 12 * count); return words(start); },
  };
}

test('G5D-9.7: the page collector keeps every completed readback: failure before any result, after the plane, after the diagnostic readback and after an operational batch', async () => {
  need(Col, Cf, Mt);
  const full = gpuRaw(committedMatrix(), 'F');
  const run = async failAt => { const slots = []; let error = null; try { await Col.collectG5d(collectorDeps(full, { failAt }), slots); } catch (e) { error = e; } return { slots, error }; };
  const none = await run('plane');
  assert.equal(none.slots.length, 0); assert.match(none.error.message, /plane/);
  const afterPlane = await run('shader');
  assert.deepEqual(afterPlane.slots.map(s => s.slot), ['qjulia-plane', 'qjulia-operational']);
  assert.deepEqual(afterPlane.slots[0].raw.words, Array.from(planeU32())); assert.equal(afterPlane.slots[0].raw.form, Cf.G5D_FORM);
  assert.match(afterPlane.slots[1].raw.failure, /shader/); assert.deepEqual(afterPlane.slots[1].raw.batches, []);
  const afterDiag = await run('batch0');
  assert.deepEqual(afterDiag.slots[1].raw.continuation, full.continuation); assert.deepEqual(afterDiag.slots[1].raw.batches, []);
  const afterBatch = await run('batch64');
  assert.equal(afterBatch.slots[1].raw.batches.length, 1); assert.deepEqual(afterBatch.slots[1].raw.batches[0], full.batches[0]);
  const ok = await run(null);
  assert.equal(ok.error, null); assert.deepEqual({ ...ok.slots[1].raw }, { ...full });
  for (const s of ok.slots) assert.equal(s.timingMethod.kind, 'correctness-only');
  // the inputs are the matrix's effective words, bit for bit, three vec4 per sample (q, C, (R, 0, 0, 0))
  const m = committedMatrix(), packed = new Uint32Array(Cf.packOperationalInputs(m.cases.slice(0, 2)).buffer);
  assert.deepEqual(Array.from(packed), m.cases.slice(0, 2).flatMap(c => [...c.inputWords, c.radiusWord, '00000000', '00000000', '00000000'].map(h => parseInt(h, 16))));
});

test('G5D-9.7: writer to reader: every completed observation survives finalise → recompute, and a closure round trip reports them beside the verdict', async () => {
  need(Col, Cf, Mt);
  const { finalise } = await import('../run.mjs');
  const { closeG5d } = await imp('../close-g5d.mjs');
  const ctx = await load(), full = gpuRaw(committedMatrix(), 'F'), root = await scratch();
  try {
    const args = ['--enable-gpu'];
    const launchInfo = { args: 'remediation', requestedArgs: args, commandLine: `chrome ${args.join(' ')} --user-data-dir=/p`, profile: '/p', mode: 'headed' };
    const id = { ...identity('headed'), ...launchIdentity(launchInfo) };
    const outcomes = {};
    for (const failAt of ['plane', 'shader', 'batch0', 'batch64', null]) {
      const slots = []; let invalidations = [];
      try { await Col.collectG5d(collectorDeps(full, { failAt }), slots); } catch (e) { invalidations = [`driver error: ${e.message}`]; }
      const runDir = join(root, 'artifacts/project0', `run-${failAt ?? 'ok'}`); await mkdir(runDir, { recursive: true });
      outcomes[failAt ?? 'ok'] = await finalise({ gate: 'G5', mode: 'headed', campaign: 'webgpu-g5d', runDir, identity: id, launchInfo, chromeGpuText: '', fixtures: fx, experiment: false, invalidations: [],
        outcome: { result: slots.length ? { slots, invalidations } : { error: invalidations[0] ?? 'no result', slots: [] } } });
    }
    const records = Object.values(outcomes).flat().filter(r => r.invalidations.length);
    const out = await Q.recompute(records, fx, { manifest: { requestedArgs: args }, collect: true, qualification: ctx });
    assert.deepEqual(out.errors, {});
    const obs = name => out.g5Observations[outcomes[name].find(r => r.slot === 'qjulia-operational').id];
    assert.deepEqual(out.g5Observations[outcomes.plane[0].id], { slot: 'incomplete', collected: false });
    assert.equal(out.g5Observations[outcomes.shader.find(r => r.slot === 'qjulia-plane').id].metrics.statusErrors, 0, 'the plane observation survives a later failure');
    assert.equal(obs('shader').collected.batches, 0); assert.equal(obs('shader').continuation, null);
    assert.equal(obs('batch0').continuation.componentRatio.toFixed(10), '2.7497713107', 'the diagnostic survives a later batch failure');
    assert.equal(obs('batch64').collected.batches, 1); assert.equal(obs('batch64').collected.samples, 64);
    for (const name of ['shader', 'batch0', 'batch64']) assert.ok(obs(name).invalidation, `${name}: partial evidence is never a qualifying pass`);
    const clean = outcomes.ok;
    assert.deepEqual(clean.map(r => r.invalidations), [[], []]);
    assert.deepEqual(clean.find(r => r.slot === 'qjulia-operational').metrics, Mt.operationalMetrics(full, fx));
    // closure round trip with captured writes: the observations of the partial invocation travel into the separate G5-D decision
    const manifest = Q.buildManifest({ records: outcomes.batch64, fixture, campaign: 'webgpu-g5d', args: 'remediation', requestedArgs: args, runDirs: [`../runtime/${root.split('/').at(-1)}/artifacts/project0/run-batch64`], qualification: ctx });
    const mpath = join(root, 'm.json'), hpath = join(root, 'webgpu-g5d.md');
    await writeFile(mpath, JSON.stringify(manifest)); await writeFile(hpath, '# G5-D\n');
    const writes = [];
    const decision = await closeG5d({ manifest: mpath, history: hpath }, { loadFixtures: async () => fx, verifyPreflight: async () => {}, writeFile: async (path, data) => { writes.push({ path, data }); }, log: () => {} });
    assert.equal(writes.length, 1); assert.ok(writes[0].path.endsWith('docs/reports/project0/webgpu-g5d-decision.json'));
    const opId = outcomes.batch64.find(r => r.slot === 'qjulia-operational').id;
    assert.equal(JSON.parse(writes[0].data).g5Observations[opId].collected.batches, 1);
    assert.equal(decision.gates.G5.status, 'invalid/inconclusive');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('G5D-8.4: the arithmetic contract comes from the authenticated profile, never from the developer flag alone', async () => {
  need(Cf);
  const ctx = await load(), e7 = await Qn.loadQualification(E7);
  const launch = { requestedArgs: ['--enable-gpu', DEVELOPER_FLAG] }, acq = [{ epoch: 1, requestedFeatures: [], features: [], grantedFeatures: [] }];
  const g5 = { id: 'g5', gate: 'G5', slot: 'qjulia-operational', identity: { mode: 'headed' } };
  assert.deepEqual(ER.remediationRecordProblems(g5, { form: Cf.G5D_FORM, acquisitions: acq }, launch, null, ctx), []);
  assert.match(ER.remediationRecordProblems(g5, { form: V.COMPENSATED_FORM, acquisitions: acq }, launch, null, ctx).join(';'), /g5d/);
  assert.match(ER.remediationRecordProblems(g5, { form: Cf.G5D_FORM, acquisitions: acq }, launch, null, e7).join(';'), /compensated/);
  assert.match(ER.remediationRecordProblems(g5, { form: Cf.G5D_FORM, acquisitions: acq }, launch, null, null).join(';'), /compensated/, 'without a profile, the historical rule is unchanged');
  assert.throws(() => ER.remediationRecordProblems(g5, { form: Cf.G5D_FORM, acquisitions: acq }, launch, null, { ...ctx }), /verified qualification/);
});

// --- §9.9 S3 ------------------------------------------------------------------------------------------------------------------------------
test('G5D-9.9: correctly collected S3 status, index and numerical disagreements do not fail the gate; missing or corrupt S3 evidence does; S3 never qualifies', async () => {
  need(Mt, Cf);
  const m = committedMatrix(), s3 = m.cases.filter(c => c.role === 'diagnostic');
  const raw = gpuRaw(m, 'U', { mutate: (c, r) => (c.id === s3[0].id ? { status: 'budget', e: null, rows: Array(128).fill(['00000000', '00000000', '00000000', '00000000']), log: null } : c.id === s3[1].id ? { ...r, rows: r.rows.map(row => ['7fc00000', ...row.slice(1)]) } : r) });
  const metrics = Mt.operationalMetrics(raw, fx), o = Mt.operationalObservation(raw, fx);
  assert.deepEqual([metrics.statusErrors, metrics.indexErrors, metrics.numericalFailures], [0, 0, 0]);
  assert.equal(metrics.qualifying, 223);
  assert.ok(o.diagnostics.statusIndexDisagreements >= 2, JSON.stringify(o.diagnostics));
  assert.ok(o.diagnostics.outsideNumericalCriteria >= 2);
  assert.ok(o.diagnostics.samples === 64 && o.diagnostics.role === 'diagnostic');
  assert.ok(!o.qualifyingIds.some(id => s3.some(c => c.id === id)));
  const ctx = await load(), plan = await effPlan();
  const g5 = [rec('G5', 'qjulia-plane', {}, plan), rec('G5', 'qjulia-operational', { metrics }, plan)];
  assert.equal(GC.evaluateGateChecked('G5', g5, Q.buildManifest({ records: g5, ...base(ctx) }), fx, { raws: rawsOf(g5), qualification: ctx }).status, 'pass');
  const at = s3[0].id, bi = Math.floor(m.cases.findIndex(c => c.id === at) / Cf.OPERATIONAL_LAYOUT.batch);
  const missing = { ...raw, batches: raw.batches.filter((_, i) => i !== bi) };
  assert.throws(() => Mt.operationalMetrics(missing, fx), e => e.invalidation === true && /batch/.test(e.message));
  const corrupt = JSON.parse(JSON.stringify(raw)), k = m.cases.findIndex(c => c.id === at) - bi * Cf.OPERATIONAL_LAYOUT.batch;
  corrupt.batches[bi].words[4 * Cf.OPERATIONAL_LAYOUT.stride * k] = 7;
  assert.throws(() => Mt.operationalMetrics(corrupt, fx), e => e.invalidation === true && new RegExp(at).test(e.message));
  const short = JSON.parse(JSON.stringify(raw)); short.batches[bi].words.pop();
  assert.throws(() => Mt.operationalMetrics(short, fx), e => e.invalidation === true);
  const noCont = { ...raw, continuation: null };
  assert.throws(() => Mt.operationalMetrics(noCont, fx), e => e.invalidation === true && /continuation/.test(e.message), 'the forced-continuation diagnostic is mandatory');
});

// --- §9.10 campaign -----------------------------------------------------------------------------------------------------------------------
const IMPL = { implementationCommit: 'd'.repeat(40), implementationHash: 'e'.repeat(64) };
const { evaluatePreflight } = await import('../integrity-preflight.mjs');
const REMEDIATION_ARGS = JSON.parse(readFileSync(join(ROOT, 'spikes/project0/launch-remediation.json'), 'utf8'));
const pageLoad = () => ({ transport: 'p0Push', sameTaskRevert: { violations: ['unexpected backing 800x720 at 21'] }, undeliveredAtStop: { violations: ['unexpected backing 640x720 at 23'] },
  allowedResizes: { violations: [], events: [{ deliberate: true }, { deliberate: true }, { deliberate: true }] },
  statusVisibility: { position: 'fixed', offsetParentNull: true, visible: true, controls: { visibleFixed: true, displayNone: false, visibilityHidden: false, zeroSize: false, opacityZero: false, offscreen: false } } });
function preflightRecord(args) {
  const first = { slots: [{ raw: pageLoad() }] }, reload = { slots: [{ raw: pageLoad() }] };
  const { assertions } = evaluatePreflight({ first: first.slots[0].raw, reload: reload.slots[0].raw, evaluates: 0 });
  return { schema: 1, kind: 'integrity-preflight', pass: true, assertions, evaluates: 0, mode: 'headed', errors: [], implementation: IMPL,
    launch: { commandLine: `chrome ${args.join(' ')} --user-data-dir=/p`, profile: '/p', requestedArgs: [...args] }, first, reload };
}
function campaignDeps(over = {}) {
  const calls = [];
  const d = { LAUNCH: { remediation: REMEDIATION_ARGS, attempt1: ['--enable-gpu'] }, calls,
    runSession: async o => { calls.push(`session ${o.gate} ${o.mode}${o.extra ?? ''}`); return { records: [], runDir: `/x/${o.gate}-${o.mode}` }; },
    runG2: async () => { calls.push('g2'); return { records: [], runDir: '/x/g2' }; },
    runPreflight: async o => { calls.push(`preflight ${o.mode} ${o.args.join(' ')}`); return { pass: true, record: preflightRecord(o.args), runDir: '/x/pf' }; },
    implementationIdentity: async () => IMPL, fixtureIdentity: async () => fixture, readFixtures: async () => fx,
    loadCampaign: async () => { throw new Error('none'); }, verifyPreflight: async () => {}, bindAuxiliary: async () => ({}), loadBaseline: async () => ({ records: [], raws: {} }),
    recompute: async records => ({ records, launches: [], raws: rawsOf(records), errors: {}, g5Observations: {} }), writeReport: async (n, m, g) => { calls.push({ report: { n, m, g } }); }, log: () => {},
    loadQualification: id => Qn.loadQualification(id), verifyKnownLimitations: async () => { calls.push('limitations'); }, verifyHistoricalReferences: async () => { calls.push('historical'); return {}; }, ...over };
  return d;
}

test('G5D-9.10: webgpu-g5d requires the profile, the remediation launch configuration, every gate and empty reuse, all refused before anything runs', async () => {
  const { runCampaign } = await import('../campaign.mjs');
  const refused = [
    [{ name: 'webgpu-g5d', args: 'remediation', reuse: '[]' }, /qualification/],
    [{ name: 'webgpu-g5d', args: 'remediation', reuse: '[]', qualification: E7 }, /qualification/],
    [{ name: 'webgpu-g5d', args: 'remediation', reuse: '[]', qualification: ID, gates: 'G5' }, /every gate/],
    [{ name: 'webgpu-g5d', args: 'attempt1', reuse: '[]', qualification: ID }, /remediation/],
    [{ name: 'webgpu-g5d', args: 'remediation', qualification: ID, reuse: JSON.stringify([{ gate: 'G4', slot: 'bulb-samples', fromManifest: 'docs/reports/project0/webgpu-remediation-manifest.json', recordId: 'x', reason: 'r' }]) }, /reuse/],
    [{ name: 'webgpu-remediation', args: 'remediation', reuse: '[]', qualification: ID }, /qualification/],
  ];
  for (const [values, re] of refused) { const d = campaignDeps(); await assert.rejects(runCampaign(values, d), re, JSON.stringify(values)); assert.deepEqual(d.calls.filter(c => typeof c === 'string' && /^(session|g2|preflight)/.test(c)), [], JSON.stringify(values)); }
  const altered = campaignDeps({ LAUNCH: { remediation: [...REMEDIATION_ARGS, '--disable-gpu-watchdog'] } });
  await assert.rejects(runCampaign({ name: 'webgpu-g5d', args: 'remediation', reuse: '[]', qualification: ID }, altered), /launch configuration/);
  const hist = campaignDeps({ verifyHistoricalReferences: async () => { throw new Error('webgpu-decision.json does not match its pinned hash'); } });
  await assert.rejects(runCampaign({ name: 'webgpu-g5d', args: 'remediation', reuse: '[]', qualification: ID }, hist), /pinned hash/);
  assert.deepEqual(hist.calls.filter(c => typeof c === 'string' && /^(session|g2|preflight)/.test(c)), []);
});

test('G5D-9.10: the campaign requests G1–G13 headed with a fresh preflight at the final identity first; G5 alone carries the profile to the page; existing stops still stop', async () => {
  const { runCampaign } = await import('../campaign.mjs');
  const plan = await effPlan();
  const correct = { 'G1 headed': [rec('G1', 'headed', {}, plan)], 'G4 headed': [rec('G4', 'bulb-samples', {}, plan)], 'G5 headed': [rec('G5', 'qjulia-plane', {}, plan), rec('G5', 'qjulia-operational', {}, plan)],
    'G3 headed': Object.keys(plan.G3).map(s => rec('G3', s, {}, plan)), 'G11 headed': [rec('G11', '4k', {}, plan)], 'G13 headed': ['intentional', 'injected', 'repeated'].map(s => rec('G13', s, {}, plan)) };
  const d = campaignDeps({ runSession: async o => { d.calls.push(`session ${o.gate} ${o.mode}${o.extra ?? ''}`); return { records: correct[`${o.gate} ${o.mode}`] ?? [], runDir: `/x/${o.gate}-${o.mode}` }; } });
  const out = await runCampaign({ name: 'webgpu-g5d', args: 'remediation', reuse: '[]', qualification: ID }, d);
  const steps = d.calls.filter(c => typeof c === 'string');
  assert.deepEqual(steps, ['limitations', 'historical', `preflight headed ${REMEDIATION_ARGS.join(' ')}`, 'session G1 headed', 'session G4 headed', `session G5 headed&qualification=${ID}`, 'session G3 headed', 'session G11 headed', 'session G13 headed',
    'g2', 'session timing headed', 'session G8 headed', 'session G10 headed', 'session G12 headed']);
  const report = d.calls.find(c => c.report).report;
  assert.equal(report.n, 'webgpu-g5d'); assert.deepEqual(report.m.reuse, []); assert.deepEqual(report.m.requestedArgs, REMEDIATION_ARGS);
  assert.deepEqual(report.m.preflight, { runDir: 'pf', ...IMPL });
  assert.deepEqual(report.m.qualification, Qn.qualificationReference(await load()));
  assert.deepEqual(Object.keys(report.m.excludedTrials).sort(), ['G1/headless', 'G5/qjulia-offplane']);
  assert.ok(report.g.scope.includes('E8') && report.g.scope.includes('E9') && report.g.scope.includes('E7'));
  assert.equal(out.backend.gates.G5.status, 'pass'); assert.equal(out.backend.gates.G1.status, 'pass');
  // a numerical G5 failure stops at the correctness boundary; later gates are not run with that reason
  const failing = { ...correct, 'G5 headed': [rec('G5', 'qjulia-plane', {}, plan), rec('G5', 'qjulia-operational', { metrics: { ...rec('G5', 'qjulia-operational', {}, plan).metrics, numericalFailures: 2 } }, plan)] };
  const stop = campaignDeps({ runSession: async o => { stop.calls.push(`session ${o.gate} ${o.mode}`); return { records: failing[`${o.gate} ${o.mode}`] ?? [], runDir: `/x/${o.gate}` }; } });
  const s = await runCampaign({ name: 'webgpu-g5d', args: 'remediation', reuse: '[]', qualification: ID }, stop);
  assert.equal(s.backend.gates.G5.status, 'fail'); assert.equal(s.backend.gates.G2.status, 'not run'); assert.equal(s.backend.gates.G2.blockedBy, 'G5');
  assert.ok(!stop.calls.includes('g2'));
  // a live stop (device loss) stops the campaign at once
  const lost = campaignDeps({ runSession: async o => { lost.calls.push(`session ${o.gate} ${o.mode}`); return { records: o.gate === 'G1' ? [rec('G1', 'headed', { invalidations: ['device lost: unknown'] }, plan)] : correct[`${o.gate} ${o.mode}`] ?? [], runDir: `/x/${o.gate}` }; } });
  await runCampaign({ name: 'webgpu-g5d', args: 'remediation', reuse: '[]', qualification: ID }, lost);
  assert.deepEqual(lost.calls.filter(c => typeof c === 'string' && c.startsWith('session')), ['session G1 headed']);
});

// --- §9.11 closure ------------------------------------------------------------------------------------------------------------------------
test('G5D-9.11: closure writes only webgpu-g5d-decision.json, with the profile, matrix and kernel identities, exclusions, diagnostics, historical hashes and manifest hash; webgpu-decision.json is untouched', async () => {
  const { closeG5d } = await imp('../close-g5d.mjs');
  assert.equal(typeof closeG5d, 'function');
  const { closeRemediation } = await import('../close-remediation.mjs');
  const ctx = await load(), root = await scratch();
  try {
    const m = Q.buildManifest({ records: [], ...base(ctx), runDirs: [] });
    await mkdir(join(root, 'docs'), { recursive: true });
    const put = async (name, value) => { const text = typeof value === 'string' ? value : JSON.stringify(value); await writeFile(join(root, `docs/${name}`), text); return text; };
    const text = await put('m.json', m), history = await put('h.md', '# G5-D\n');
    const writes = [];
    const deps = { root, loadFixtures: async () => fx, verifyPreflight: async () => {}, writeFile: async (path, data) => { writes.push({ path, data }); }, log: () => {} };
    await closeG5d({ manifest: 'docs/m.json', history: 'docs/h.md' }, deps);
    assert.equal(writes.length, 1); assert.equal(writes[0].path, resolve(root, 'docs/reports/project0/webgpu-g5d-decision.json'));
    const out = JSON.parse(writes[0].data);
    assert.deepEqual(out.qualification, Qn.qualificationReference(ctx)); assert.deepEqual(out.excludedTrials, m.excludedTrials); assert.deepEqual(out.knownLimitations, m.knownLimitations);
    assert.equal(out.manifestSha256, sha(text)); assert.equal(out.historySha256, sha(history));
    assert.deepEqual(out.matrix, { path: 'spikes/project0/qualification/g5d-matrix.json', sha256: 'b74ecc9e404ace915fe59fd7e4ea0acb097743157e376bff2edf45f19663c96e' });
    assert.equal(out.kernel.fragmentSha256, FRAGMENT); assert.equal(out.kernel.shader.sha256, ctx.doc.kernel.shader.sha256); assert.equal(out.kernel.form, Cf.G5D_FORM);
    assert.equal(out.dispositions.S3.disposition, 'diagnostic'); assert.equal(out.dispositions.S3.authority, 'E9');
    assert.deepEqual(Object.fromEntries(out.historical.files.map(f => [f.path, f.sha256])), HISTORY);
    assert.deepEqual(out.historical.offplane.map(o => [o.campaign, o.sha256, o.componentRatio]), [['webgpu-1', RECORDS['webgpu-1'], 2.7497713106862958], ['webgpu-remediation', RECORDS['webgpu-remediation'], 4.744852004194964]]);
    assert.ok(out.disclosure.join('\n').includes('This is not a pass of the original G5 contract.'));
    assert.ok(out.disclosure.join('\n').includes('Qualifying escaping orbits cover escape indices 0–11 only; escape indices 12–128 are not validated by this qualification.'));
    assert.notEqual(out.decision.outcome, 'WebGPU selected');
    assert.ok(!('G1/headless' in out.gates) && !('G5/qjulia-offplane' in out.gates));
    const { excludedTrials, ...stripped } = m; void excludedTrials;
    await put('s.json', stripped);
    await assert.rejects(closeG5d({ manifest: 'docs/s.json', history: 'docs/h.md' }, deps), /excludedTrials/);
    await put('e.json', Q.buildManifest({ records: [], fixture, campaign: 'webgpu-remediation', args: 'remediation', requestedArgs: ['--enable-gpu'], runDirs: [], qualification: await Qn.loadQualification(E7) }));
    await assert.rejects(closeG5d({ manifest: 'docs/e.json', history: 'docs/h.md' }, deps), /project0-g5d-v1/);
    await put('hh.md', '# h\n\n## Classification\nx\n\n## Change set\ny\n');
    await assert.rejects(closeRemediation({ manifest: 'docs/m.json', history: 'docs/hh.md' }, deps), /close-g5d/, 'the remediation closure never writes a G5-D decision into webgpu-decision.json');
    assert.equal(writes.length, 1, 'refused closures write nothing');
    assert.equal(sha(readFileSync(join(ROOT, 'docs/reports/project0/webgpu-decision.json'))), HISTORY['docs/reports/project0/webgpu-decision.json']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// --- §9.12 frozen boundary ----------------------------------------------------------------------------------------------------------------
test('G5D-9.12: the 24 frozen sources, fixtures.json, the specification and fields.wgsl are byte-identical to the freeze', async () => {
  const fixtures = JSON.parse(await readFile(join(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
  const p = fixtures.provenance;
  assert.equal(p.sources.length, 24); assert.deepEqual(p.sources.map(x => x.path), [...SOURCE_PATHS]);
  for (const x of p.sources) { assert.equal(sha(readFileSync(join(ROOT, x.path))), x.sha256, x.path); assert.ok(readFileSync(join(ROOT, x.path)).equals(git('show', `${p.generatorCommit}:${x.path}`)), x.path); }
  assert.equal(sha(readFileSync(join(ROOT, p.specPath))), BASE.specHash);
  assert.equal(sha(readFileSync(join(ROOT, 'spikes/project0/fixtures.json'))), BASE.fixtureHash);
  assert.ok(readFileSync(join(ROOT, 'spikes/project0/fixtures.json')).equals(git('show', '9c59e51:spikes/project0/fixtures.json')));
  assert.ok(readFileSync(join(ROOT, 'spikes/project0/gpu/fields.wgsl')).equals(git('show', '9c59e51:spikes/project0/gpu/fields.wgsl')));
});

// --- §9.13 offline shader validation ------------------------------------------------------------------------------------------------------
const NAGA = '/mnt/ml_storage/scratch/cargo/bin/naga';
test('G5D-9.13: the complete concatenated fields + arithmetic source passes the offline naga validator (no browser, no GPU device)', { skip: !existsSync(NAGA) && 'naga not installed on this host' }, async () => {
  const root = await scratch();
  try {
    const code = fieldsSrc() + arithSrc(), path = join(root, 'arithmetic-concatenated.wgsl');
    await writeFile(path, code);
    assert.equal(sha(readFileSync(path)), (await load()).doc.kernel.shader.sha256);
    const out = execFileSync(NAGA, [path], { encoding: 'utf8' });
    assert.match(out, /Validation successful/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
