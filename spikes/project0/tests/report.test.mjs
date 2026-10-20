// spikes/project0/tests/report.test.mjs — T13 report tool. Adapted from the brief (task-T13-report.md, "Adaptations"):
// - renderReport takes the verified selection (E10) and the qualification scope; the mechanical outcome and the user-override selection are shown
//   side by side, G1/headless is a separate non-gate row, G6/G7/G9 carry the timing carry-forward.
// - The brief's synthetic evidence tree predates the T10 fix rounds (preflight, supervision sidecars, profiles) and cannot pass today's loaders;
//   the CLI tests instead run against a scratch copy of the committed evidence (artifacts/project0, docs, spikes) under artifacts/runtime, and
//   damage that copy. They are skipped, with the reason, when the git-ignored raw evidence is absent.
// - Every implementation identity is authenticated against its own commit (Codex's T13 condition) — unit-tested with an injected git.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from '../launch.mjs';
import { renderReport, authenticateImplementation, TIMING_CARRY, timingCarry, resultsGates, verifyPrecision, CHAIN } from '../report.mjs';
import { sha256, launchIdentity } from '../evidence.mjs';
import { GATES, canonical } from '../contract.js';

const run = promisify(execFile);
const pass = Object.fromEntries(GATES.map(g => [g, { status: 'pass', reasons: [] }]));
const timingInvalid = { ...pass, G6: { status: 'invalid/inconclusive', reasons: ['G7 schedule deviation'] }, G7: { status: 'invalid/inconclusive', reasons: ['x'] }, G9: { status: 'invalid/inconclusive', reasons: ['missing required trials'] } };
const E10 = { basis: 'user decision E10', backend: 'webgpu', text: 'WebGPU, chosen by explicit user override (E10); timing qualification incomplete' };
const scope = { scope: 'Qualification scope: headed execution only, under E7.', headlessRow: 'G1/headless — Not required under E7; not scheduled in this campaign.', knownLimitations: [] };

test('the report restates the mechanical decision and refuses inconsistent inputs', () => {
  const md = renderReport({ decision: { outcome: 'WebGPU selected' }, backend: { gates: pass, remediationClosed: true }, precision: null, unsafeFlag: false });
  assert.match(md, /Mechanical outcome: \*\*WebGPU selected\*\*/);
  assert.throws(() => renderReport({ decision: { outcome: 'WebGPU selected' }, backend: { gates: { ...pass, G8: { status: 'fail', reasons: ['x'] } }, remediationClosed: true } }), /decision does not follow/);
  assert.match(renderReport({ decision: { outcome: 'WebGPU selected' }, backend: { gates: pass, remediationClosed: true }, unsafeFlag: true }), /depends on `--enable-unsafe-webgpu`/);
});

test('an override selection is shown beside the inconclusive mechanical outcome, never in its place', () => {
  const md = renderReport({ decision: { outcome: 'inconclusive' }, backend: { gates: timingInvalid, remediationClosed: true }, selection: E10, ...scope });
  assert.match(md, /Mechanical outcome: \*\*inconclusive\*\*/);
  assert.match(md, /Selection: \*\*WebGPU, chosen by explicit user override \(E10\); timing qualification incomplete\*\*/);
  assert.match(md, /exception to the specification §6 rule/);
  assert.doesNotMatch(md, /Mechanical outcome: \*\*WebGPU selected/);
  assert.throws(() => renderReport({ decision: { outcome: 'inconclusive' }, backend: { gates: timingInvalid, remediationClosed: true }, selection: { ...E10, basis: 'mechanical' }, ...scope }), /selection/);
});

test('G1/headless is its own row, never a gate and never a pass; G6/G7/G9 carry the timing carry-forward', () => {
  const md = renderReport({ decision: { outcome: 'inconclusive' }, backend: { gates: timingInvalid, remediationClosed: true }, selection: E10, ...scope });
  assert.match(md, /Qualification scope: headed execution only, under E7\./);
  const rows = md.split('\n').filter(l => /^\| G1(\/headless)? \|/.test(l));
  assert.equal(rows.length, 2);
  assert.match(rows[0], /^\| G1 \| pass/);
  assert.match(rows[1], /^\| G1\/headless \| Not required under E7/);
  assert.doesNotMatch(rows[1], /\| pass/);
  for (const g of ['G6', 'G7', 'G9']) assert.match(md.split('\n').find(l => l.startsWith(`| ${g} |`)), new RegExp(TIMING_CARRY.replace(/[.;()]/g, '\\$&')));
});

test('a not-interpretable precision summary is reported as such', () => {
  const md = renderReport({ decision: { outcome: 'inconclusive' }, backend: { gates: timingInvalid, remediationClosed: true }, selection: E10, ...scope,
    precision: { interpretable: false, executionInvalidations: ['no observable progress for 5 s: [band:3]'], environmentError: null, timingError: null, interpretationError: null } });
  assert.match(md, /Not interpretable: no observable progress/);
});

// Codex's T13 condition: a run's implementation (and so its shader) is authenticated from its own commit, never from the current files.
test('implementation identities authenticate against their own commit; a forged hash or shader is refused', async () => {
  const tree = { 'spikes/project0/a.js': 'A', 'spikes/project0/gpu/fields.wgsl': 'F', 'spikes/project0/gpu/arithmetic.wgsl': 'R', 'spikes/project0/tests/t.mjs': 'T', 'spikes/project0/fixtures.json': '{}' };
  const git = { list: async () => Object.keys(tree), show: async (_c, p) => Buffer.from(tree[p]) };
  const files = Object.keys(tree).filter(p => !p.includes('/tests/') && !p.endsWith('fixtures.json')).sort();
  const { createHash } = await import('node:crypto'); const h = createHash('sha256');
  for (const p of files) h.update(p).update('\0').update(tree[p]).update('\0');
  const hash = h.digest('hex'), shader = sha256('FR');
  const ok = await authenticateImplementation({ implementationCommit: 'c', implementationHash: hash }, [{ id: 'r', shader }, { id: 'p', shader: null }], { git });
  assert.equal(ok.shader, shader); assert.deepEqual(ok.shaderRecords, ['r']);
  await assert.rejects(authenticateImplementation({ implementationCommit: 'c', implementationHash: 'f'.repeat(64) }, [], { git }), /does not authenticate/);
  await assert.rejects(authenticateImplementation({ implementationCommit: 'c', implementationHash: hash }, [{ id: 'r', shader: sha256('XX') }], { git }), /shader/);
});

// Fix round 1 (Codex T13 r1 finding 5): one timing classification, used by the Markdown and the JSON alike.
test('the timing carry-forward is one classification shared by the Markdown and the results JSON', () => {
  const noDeviation = { ...pass, G9: { status: 'invalid/inconclusive', reasons: ['missing required trials'] } };
  assert.equal(timingCarry(noDeviation), false); assert.equal(timingCarry(timingInvalid), true);
  assert.equal(resultsGates(noDeviation).G9.carryForward, undefined);
  assert.doesNotMatch(renderReport({ decision: { outcome: 'inconclusive' }, backend: { gates: noDeviation, remediationClosed: true } }), new RegExp(TIMING_CARRY));
  for (const g of ['G6', 'G7', 'G9']) assert.equal(resultsGates(timingInvalid)[g].carryForward, TIMING_CARRY);
  assert.equal(resultsGates(timingInvalid).G8.carryForward, undefined);
});

// Finding 4: every precision row states whether it was interpreted; an uninterpreted row shows no threshold result.
test('precision rows carry their interpretation status', () => {
  const side = (n, x) => ({ vsRequested: { eligible: 100, statusDisagreements: n, largeDepthErrors: n, thresholdExceeded: x } });
  const cost = { baseline: { workMs: { median: 1 } }, compensated: { workMs: { median: 2 } } };
  const md = renderReport({ decision: { outcome: 'inconclusive' }, backend: { gates: timingInvalid, remediationClosed: true },
    precision: { interpretable: true, validated: true, primitiveFailures: [], observedDisagreementThreshold: null, firstStop: { distance: 0.01, reasons: ['anchor'] },
      rows: [{ distance: 0.1, interpreted: true, baseline: side(1, false), compensated: side(0, false), cost, extraBytes: 0 }, { distance: 0.01, interpreted: false, baseline: side(9, true), compensated: side(9, true), cost, extraBytes: 0 }] } });
  const row = d => md.split('\n').find(l => l.startsWith(`| ${d} |`));
  assert.match(row(0.1), /^\| 0\.1 \| yes \|/); assert.match(row(0.01), /^\| 0\.01 \| no \| not interpreted \| not interpreted \|/);
});

// Finding 7 (adaptation 9): the brief's precision round trips, portable (synthetic evidence through the exported verifier seam, no raw evidence).
async function precisionTree({ slot, invalidations, raw, summary }) {
  const base = resolve(ROOT, 'artifacts/runtime'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'p0-report-prec-'));
  const fixture = { fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64) };
  const launch = { args: 'remediation', requestedArgs: ['--enable-gpu'], commandLine: 'chrome --enable-gpu --user-data-dir=/p', profile: '/p', mode: 'headed' };
  const identity = { backend: 'webgpu', ...fixture, implementationCommit: 'd'.repeat(40), implementationHash: 'e'.repeat(64), ...launchIdentity(launch), browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's' };
  const rawText = JSON.stringify(raw), launchText = JSON.stringify(launch);
  await mkdir(join(root, 'artifacts/project0/prec'), { recursive: true });
  await writeFile(join(root, 'artifacts/project0/prec/P.raw.json'), rawText); await writeFile(join(root, 'artifacts/project0/prec/P.launch.json'), launchText);
  const record = { schema: 1, id: 'P', gate: 'precision', slot, campaign: 'precision', mode: 'headed', experiment: true, identity, invalidations, metrics: {},
    artifacts: [{ path: 'prec/P.raw.json', sha256: sha256(rawText) }, { path: 'prec/P.launch.json', sha256: sha256(launchText) }] };
  await writeFile(join(root, 'artifacts/project0/prec/P.json'), canonical(record));
  const finalBytes = Buffer.from('{"decision":"synthetic"}'), manifest = { fixture, args: 'remediation', requestedArgs: ['--enable-gpu'] };
  const final = { manifest: 'm.json', manifestSha256: 'f'.repeat(64), decision: { outcome: 'inconclusive' } };
  const records = [{ identity }], fixtures = {};
  const { assessPrecision } = await import('../measure/precision.mjs');
  const selection = { basis: 'user decision E10', backend: 'webgpu', mechanicalOutcome: 'inconclusive', decisionFile: CHAIN.final.decision, decisionSha256: sha256(finalBytes) };
  const saved = { manifest: final.manifest, manifestSha256: final.manifestSha256, selection, record: 'P', runDir: 'prec', args: 'remediation', requestedArgs: ['--enable-gpu'],
    ...assessPrecision({ fx: fixtures, record, raw, selected: records }), ...(summary ?? {}) };
  return { root, args: { root, saved, final, finalBytes, manifest, fixtures, records } };
}
const render = precision => renderReport({ decision: { outcome: 'inconclusive' }, backend: { gates: timingInvalid, remediationClosed: true }, precision });

test('an honest aborted precision run is reported as not interpretable and does not block the report', async () => {
  const t = await precisionTree({ slot: 'incomplete', invalidations: ['no observable progress for 5 s: [band:3]'], raw: { error: 'aborted' } });
  try { assert.match(render(await verifyPrecision(t.args)), /Not interpretable: no observable progress/); } finally { await rm(t.root, { recursive: true, force: true }); }
});

test('a summary claiming interpretability for a record with execution invalidations is rejected', async () => {
  const t = await precisionTree({ slot: 'precision', invalidations: ['device lost: unknown'], raw: {}, summary: { interpretable: true } });
  try { await assert.rejects(verifyPrecision(t.args), /precision interpretable does not recompute/); } finally { await rm(t.root, { recursive: true, force: true }); }
});

test('an honest assessment error is recomputed, kept separate from execution invalidations, and reported', async () => {
  const t = await precisionTree({ slot: 'precision', invalidations: [], raw: { primitives: [], sets: [] } });
  try {
    assert.ok(t.args.saved.interpretationError || t.args.saved.timingError); assert.deepEqual(t.args.saved.executionInvalidations, []);
    assert.match(render(await verifyPrecision(t.args)), /Not interpretable:/);
    t.args.saved.interpretationError = t.args.saved.timingError = null;
    await assert.rejects(verifyPrecision(t.args), /does not recompute/);
  } finally { await rm(t.root, { recursive: true, force: true }); }
});

// ---- CLI against a scratch copy of the committed evidence ----
const EVIDENCE = resolve(ROOT, 'artifacts/project0');
const haveEvidence = existsSync(join(EVIDENCE, '20261020T163917297Z-webgpu-g5d-g5-headed')) && existsSync(join(EVIDENCE, '20261020T181850179Z-precision-precision-headed'));
const skip = haveEvidence ? false : 'the git-ignored raw evidence (artifacts/project0) is not present';
const DECISION = 'docs/reports/project0/webgpu-g5d-decision.json', OUT = 'out';

async function tree() {
  const base = resolve(ROOT, 'artifacts/runtime'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'p0-report-test-'));
  await cp(resolve(ROOT, 'docs'), join(root, 'docs'), { recursive: true });
  await cp(resolve(ROOT, 'spikes'), join(root, 'spikes'), { recursive: true, filter: s => !s.includes('/node_modules') });
  await cp(EVIDENCE, join(root, 'artifacts/project0'), { recursive: true });
  return root;
}
const cli = (root, script = resolve(ROOT, 'spikes/project0/report.mjs')) =>
  run(process.execPath, [script, '--decision', DECISION, '--date', '2026-10-18', '--out', OUT], { env: { ...process.env, P0_ROOT: root, TMPDIR: resolve(ROOT, 'artifacts/runtime') }, maxBuffer: 1 << 24 });
const json = async (root, p) => JSON.parse(await readFile(join(root, p), 'utf8'));
const edit = async (root, p, fn) => { const v = await json(root, p); fn(v); await writeFile(join(root, p), JSON.stringify(v, null, 2)); };

test('the CLI verifies the committed evidence and writes both outputs with the honest decision lines', { skip, timeout: 300000 }, async () => {
  const root = await tree();
  try {
    const { stdout } = await cli(root);
    assert.match(stdout, /report written/);
    const md = await readFile(join(root, OUT, '2026-10-18-project0-qualification.md'), 'utf8');
    assert.match(md, /Mechanical outcome: \*\*inconclusive\*\*/);
    assert.match(md, /Selection: \*\*WebGPU, chosen by explicit user override \(E10\); timing qualification incomplete\*\*/);
    assert.match(md, /\| G1\/headless \| Not required under E7/);
    assert.match(md, /webgpu-g1c-diagnosis\.md/); assert.match(md, /G1-headless-20261019T235719304Z-webgpu-1-g1-headless/);
    assert.match(md, /pass as amended by E8 and E9/); assert.match(md, /2\.7497713106862958/); assert.match(md, /4\.744852004194964/);
    assert.match(md, /escape indices 12–128 are not validated/);
    assert.match(md, /superseded/i); assert.match(md, /ff11b35/);
    const results = await json(root, `${OUT}/2026-10-18-project0-results.json`);
    assert.equal(results.mechanicalDecision.outcome, 'inconclusive');
    assert.equal(results.selection.basis, 'user decision E10');
    assert.equal(results.gates.G1.status, 'pass'); assert.equal(results.gates['G1/headless'], undefined);
    assert.equal(results.excludedTrials['G1/headless'].disposition, 'not-required');
    for (const g of ['G6', 'G7', 'G9']) assert.equal(results.gates[g].status, 'invalid/inconclusive');
    assert.equal(results.precision.observedDisagreementThreshold, 1e-5);
    assert.ok(results.implementations.every(i => i.authenticated));
    assert.equal(results.superseded[0].implementationCommit.slice(0, 7), 'ff11b35');
    // Finding 3: the compact verified per-trial inventory, by campaign and role, with identities and artefact hashes.
    for (const c of ['webgpu-1', 'webgpu-remediation', 'webgpu-g5d']) assert.ok(results.records.some(r => r.campaign === c && r.role === 'selected'), c);
    const g1 = results.records.find(r => r.campaign === 'webgpu-g5d' && r.gate === 'G1');
    assert.equal(g1.slot, 'headed'); assert.equal(g1.identity.fixtureCommit.length, 40); assert.ok(g1.identity.implementationCommit.startsWith('f754534')); assert.ok(g1.metrics);
    for (const r of results.records) for (const a of r.artifacts) assert.equal(sha256(await readFile(join(root, 'artifacts/project0', a.path))), a.sha256, a.path);
    assert.ok(results.records.some(r => r.role === 'precision' && r.id === 'precision-precision-20261020T181850179Z-precision-precision-headed'));
    assert.ok(results.records.some(r => r.role === 'superseded' && r.identity.implementationCommit.startsWith('ff11b35')));
    assert.equal(new Set(results.records.map(r => `${r.campaign}/${r.id}`)).size, results.records.length);
  } finally { await rm(root, { recursive: true, force: true }); }
});

const G5D_RAW = 'artifacts/project0/20261020T163917297Z-webgpu-g5d-g5-headed/G5-qjulia-operational-20261020T163917297Z-webgpu-g5d-g5-headed.raw.json';
const G5D_RECORD = 'artifacts/project0/20261020T163917297Z-webgpu-g5d-g5-headed/G5-qjulia-operational-20261020T163917297Z-webgpu-g5d-g5-headed.json';
const REM_RAW = 'artifacts/project0/20261020T051013812Z-webgpu-remediation-g5-headed/G5-qjulia-offplane-20261020T051013812Z-webgpu-remediation-g5-headed.raw.json';
const SUPERSEDED_RECORD = 'artifacts/project0/20261020T175447161Z-precision-precision-headed/precision-precision-20261020T175447161Z-precision-precision-headed.json';
const SUPERSEDED_RAW = 'artifacts/project0/20261020T175447161Z-precision-precision-headed/precision-precision-20261020T175447161Z-precision-precision-headed.raw.json';
const DAMAGES = {   // each damage, and the refusal it must produce
  'an altered raw artefact': [async r => { const p = join(r, G5D_RAW); const t = await readFile(p, 'utf8'); await writeFile(p, t.replace('"continuation"', '"continuation" ')); }, /hash|sha256|does not match/i],
  'missing raw evidence of the remediation campaign': [async r => unlink(join(r, REM_RAW)), /ENOENT|missing|no such file/i],
  'a truncated record': [async r => { const p = join(r, G5D_RECORD); const t = await readFile(p, 'utf8'); await writeFile(p, t.slice(0, t.length >> 1)); }, /JSON|truncat|hash/i],
  'a forged mechanical outcome': [async r => edit(r, DECISION, d => { d.decision.outcome = 'WebGPU selected'; }), /does not reproduce from its evidence \(decision\)/],
  'stripped exclusion metadata': [async r => edit(r, DECISION, d => { delete d.excludedTrials; }), /does not reproduce from its evidence \(excludedTrials\)/],
  'a false unsafe flag': [async r => edit(r, DECISION, d => { d.unsafeFlag = true; }), /does not reproduce from its evidence \(unsafeFlag\)/],
  'an unrecorded E10 selection': [async r => { const p = join(r, 'docs/codesign/execution-decisions.md'); const t = await readFile(p, 'utf8'); await writeFile(p, t.replace('## E10 — WebGPU selected by user decision', '## E10 — WebGPU considered')); }, /E10 user selection is not recorded/],
  'a precision summary that does not recompute': [async r => edit(r, 'docs/reports/project0/precision.json', d => { d.observedDisagreementThreshold = 1e-6; }), /precision observedDisagreementThreshold does not recompute/],
  'a precision summary bound to another decision': [async r => edit(r, 'docs/reports/project0/precision.json', d => { d.selection.decisionSha256 = 'a'.repeat(64); }), /not bound to the verified E10 selection/],
  'a historical gate verdict that does not recompute': [async r => edit(r, 'docs/reports/project0/webgpu-1-gates.json', d => { d.backend.gates.G5.status = 'pass'; }), /webgpu-1-gates.json does not reproduce/],
  'superseded record with its references removed': [async r => edit(r, SUPERSEDED_RECORD, d => { d.artifacts = []; }), /superseded/],
  'a missing superseded artefact': [async r => unlink(join(r, SUPERSEDED_RAW.replace('.raw.json', '.launch.json'))), /ENOENT|superseded/],
  'a substituted superseded record': [async r => edit(r, 'docs/reports/project0/precision-ff11b35-superseded.json', d => { d.record = 'precision-precision-20261020T181850179Z-precision-precision-headed'; d.runDir = '20261020T181850179Z-precision-precision-headed'; }), /superseded/],
  'altered superseded evidence': [async r => { const p = join(r, SUPERSEDED_RAW); await writeFile(p, (await readFile(p, 'utf8')) + ' '); }, /artefact hash mismatch: 20261020T175447161Z/],
  'changed fixtures': [async r => { const p = join(r, 'spikes/project0/fixtures.json'); await writeFile(p, (await readFile(p, 'utf8')) + '\n'); }, /fixture/i],
};

test('the CLI refuses missing, mixed, truncated or altered evidence and metadata that does not follow', { skip, timeout: 900000 }, async () => {
  const entries = Object.entries(DAMAGES), failures = [];
  for (let i = 0; i < entries.length; i += 2) await Promise.all(entries.slice(i, i + 2).map(async ([name, [damage, reason]]) => {
    const root = await tree();
    try {
      await damage(root);
      try { await cli(root); failures.push(`${name}: accepted`); } catch (e) { const err = String(e.stderr ?? ''); if (!/REPORT REFUSED/.test(err) || !reason.test(err)) failures.push(`${name}: ${err.trim() || e.message}`); }
      if (existsSync(join(root, OUT))) failures.push(`${name}: wrote output`);
    } finally { await rm(root, { recursive: true, force: true }); }
  }));
  assert.deepEqual(failures, []);
});

test('without precision evidence the report runs from a harness copy that has none of T12\'s files', { skip, timeout: 300000 }, async () => {
  const root = await tree(), T12 = new Set(['precision.mjs', 'compensated.wgsl']);
  try {
    await rm(join(root, 'spikes/project0'), { recursive: true, force: true });
    await cp(resolve(ROOT, 'spikes/project0'), join(root, 'spikes/project0'), { recursive: true,
      filter: s => !(T12.has(basename(s)) || s.endsWith('/drivers/precision.js') || s.endsWith('/precision-validation') || s.endsWith('/tests')) });
    await unlink(join(root, 'docs/reports/project0/precision.json'));
    await cli(root, join(root, 'spikes/project0/report.mjs'));
    const md = await readFile(join(root, OUT, '2026-10-18-project0-qualification.md'), 'utf8');
    assert.match(md, /Mechanical outcome: \*\*inconclusive\*\*/); assert.match(md, /Precision experiment[^]*Not run/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// Finding 1: P0_ROOT isolates verification. The module checkout (a harness-only copy) has no evidence at all; the supplied root has all of it.
test('every evidence reader is bound to the supplied root, not the module checkout', { skip, timeout: 300000 }, async () => {
  const root = await tree(), mod = await mkdtemp(join(resolve(ROOT, 'artifacts/runtime'), 'p0-report-module-'));
  try {
    await cp(resolve(ROOT, 'spikes/project0'), join(mod, 'spikes/project0'), { recursive: true, filter: s => !s.endsWith('/tests') });
    assert.equal(existsSync(join(mod, 'docs')) || existsSync(join(mod, 'artifacts')), false);
    await cli(root, join(mod, 'spikes/project0/report.mjs'));
    assert.match(await readFile(join(root, OUT, '2026-10-18-project0-qualification.md'), 'utf8'), /Mechanical outcome: \*\*inconclusive\*\*/);
  } finally { await rm(root, { recursive: true, force: true }); await rm(mod, { recursive: true, force: true }); }
});
