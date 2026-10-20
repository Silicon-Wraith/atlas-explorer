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
import { renderReport, authenticateImplementation, TIMING_CARRY } from '../report.mjs';
import { sha256 } from '../evidence.mjs';
import { GATES } from '../contract.js';

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
  } finally { await rm(root, { recursive: true, force: true }); }
});

const G5D_RAW = 'artifacts/project0/20261020T163917297Z-webgpu-g5d-g5-headed/G5-qjulia-operational-20261020T163917297Z-webgpu-g5d-g5-headed.raw.json';
const G5D_RECORD = 'artifacts/project0/20261020T163917297Z-webgpu-g5d-g5-headed/G5-qjulia-operational-20261020T163917297Z-webgpu-g5d-g5-headed.json';
const REM_RAW = 'artifacts/project0/20261020T051013812Z-webgpu-remediation-g5-headed/G5-qjulia-offplane-20261020T051013812Z-webgpu-remediation-g5-headed.raw.json';
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
