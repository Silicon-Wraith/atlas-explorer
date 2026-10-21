// spikes/project0/tests/remediation-r1.test.mjs — remediation fix round 1 (Codex run 20261020T005942Z-281d). CPU only; fixtures under
// artifacts/runtime; no browser, no GPU.
//  1. invalid G5 records are recomputed at read time: saved failure text never substitutes, and a ratio above 1 is a separate numerical failure;
//  2. a supplementary failure keeps the off-plane orbit and every completed supplementary readback;
//  3. loadBaseline fails closed on any baseline verification error;
//  4. the reported shader source hash and pipeline configuration are bound to the reviewed implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ROOT, DEVELOPER_FLAG } from '../launch.mjs';
import { execFileSync } from 'node:child_process';
// G5-D (prereg webgpu-g5d-prereg.md §8.4–§8.5): the G5-A implementation is historical; its source-level assertions are checked against the
// authenticated remediation implementation 448d5ff, never the new checkout.
const at448 = p => execFileSync('git', ['-C', ROOT, 'show', `448d5ff5eed70af1fbc579488d1f238cb155d3be:spikes/project0/${p}`], { encoding: 'utf8' });
import { sha256, launchIdentity } from '../evidence.mjs';

const fx = JSON.parse(readFileSync(new URL('../fixtures.json', import.meta.url), 'utf8'));
const V = await import('../remediation/validate.mjs');
const supp = V.supplementary();
const w = h => parseInt(h, 16);
const shaderOf = () => (typeof V.expectedShader === 'function' ? V.expectedShader() : { sha256: 'a'.repeat(64), entryPoints: [], pipelines: [] });
function rawFor(models, shader = shaderOf()) {
  const m = { primitives: 'F', dots: 'F', updates: 'F', offplane: 'F', ...models };
  const orbitWords = supp.offplane.rows[m.offplane].flatMap(r => r.split(' ').map(w));
  return { form: V.COMPENSATED_FORM, orbitWords, orbit: Array.from(new Float32Array(Uint32Array.from(orbitWords).buffer)),
    supplementary: { shader, primitives: supp.primitives.expected[m.primitives].flat().map(w), dots: supp.dots.expected[m.dots].flatMap(x => [w(x), 0, 0, 0]), updates: supp.updates.expected[m.updates].flat().map(w) } };
}

// --- 4. shader identity ----------------------------------------------------------------------------------------------------------------------
test('r1-4: the expected shader identity is the reviewed fields + arithmetic source and the fixed arithmetic pipeline configuration', () => {
  assert.equal(typeof V.expectedShader, 'function');
  const code = readFileSync(new URL('../gpu/fields.wgsl', import.meta.url), 'utf8') + readFileSync(new URL('../gpu/arithmetic.wgsl', import.meta.url), 'utf8');
  const e = V.expectedShader();
  assert.equal(e.sha256, createHash('sha256').update(code).digest('hex'));
  assert.deepEqual(e.entryPoints, ['bulb_samples', 'qjulia_plane', 'qjulia_offplane', 'derivative_policy', 'remediation_primitives', 'remediation_dot', 'remediation_updates', 'qjulia_operational'], 'G5-D appends qjulia_operational');
  const h = V.expectedShader({ implementationCommit: '448d5ff5eed70af1fbc579488d1f238cb155d3be', implementationHash: '07f6b282d10cbc08a9c58db28ddab18a3b90bfc4e082a03ef9a3084d878a0a18' });
  assert.equal(h.sha256, createHash('sha256').update(at448('gpu/fields.wgsl') + at448('gpu/arithmetic.wgsl')).digest('hex'), 'the historical G5-A expectation is its own reviewed source');
  assert.deepEqual(h.entryPoints, ['bulb_samples', 'qjulia_plane', 'qjulia_offplane', 'derivative_policy', 'remediation_primitives', 'remediation_dot', 'remediation_updates']);
  assert.equal(V.compensationReport(rawFor({}), fx).validated, true);
  const webgpu = readFileSync(new URL('../gpu/webgpu.js', import.meta.url), 'utf8');
  assert.match(webgpu, /import \{ ARITHMETIC_ENTRY_POINTS, arithmeticPipelines \} from '\.\.\/remediation\/pipeline-config\.js';/, 'the page builds its record from the same configuration');
});

test('r1-4: a zero or wrong hash, altered pipeline constants, a duplicate or extra descriptor, or other entry points leave the compensation unvalidated', () => {
  const e = shaderOf();
  const variants = {
    zeroHash: { ...e, sha256: '0'.repeat(64) },
    constants: { ...e, pipelines: e.pipelines.map(p => (p.entryPoint === 'qjulia_offplane' ? { ...p, constants: { FIELD: 3 } } : p)) },
    duplicate: { ...e, pipelines: [...e.pipelines, e.pipelines.find(p => p.entryPoint === 'remediation_updates')] },
    layout: { ...e, pipelines: e.pipelines.map(p => (p.entryPoint === 'remediation_dot' ? { ...p, layout: 'explicit' } : p)) },
    entries: { ...e, entryPoints: e.entryPoints.slice(1) },
  };
  for (const [name, shader] of Object.entries(variants)) {
    const r = V.compensationReport(rawFor({}, shader), fx);
    assert.equal(r.validated, false, name); assert.ok(r.problems.some(p => /shader/.test(p)), `${name}: ${JSON.stringify(r.problems)}`);
  }
});

// --- 2. evidence preservation --------------------------------------------------------------------------------------------------------------
test('r1-2: a supplementary failure after the orbit, or after an intermediate readback, keeps the orbit and every completed readback', async () => {
  const { collectOffplane } = await import('../remediation/collect.js');
  const orbit = Float32Array.from(supp.offplane.rows.F.flatMap(r => r.split(' ').map(h => new Float32Array(Uint32Array.of(w(h)).buffer)[0])));
  const deps = over => ({ orbit: async () => orbit, supplementaryJson: async () => supp, shader: async () => shaderOf(),
    entry: async (name, { n }) => Array.from({ length: 4 * n }, () => 0), ...over });
  {
    const slots = [];
    await assert.rejects(collectOffplane(deps({ supplementaryJson: async () => { throw new Error('remediation/supplementary.json: HTTP 404'); } }), slots, V.COMPENSATED_FORM), /HTTP 404/);
    assert.equal(slots.length, 1); assert.equal(slots[0].slot, 'qjulia-offplane');
    assert.equal(slots[0].raw.orbitWords.length, 32); assert.match(slots[0].raw.supplementaryFailure, /HTTP 404/);
  }
  {
    const slots = [];
    await assert.rejects(collectOffplane(deps({ entry: async (name, { n }) => { if (name === 'remediation_dot') throw new Error('harness readback timeout: dot'); return Array.from({ length: 4 * n }, () => 7); } }), slots, V.COMPENSATED_FORM), /dot/);
    const raw = slots[0].raw;
    assert.equal(raw.supplementary.primitives.length, 4 * 1371, 'the completed primitive readback is kept'); assert.equal(raw.supplementary.dots, undefined);
    assert.ok(raw.supplementary.shader); assert.match(raw.supplementaryFailure, /dot/);
    assert.equal(V.compensationReport(raw, fx).validated, false, 'partial evidence is unvalidated, never passed');
  }
  assert.match(at448('browser/drivers/checks.js'), /await collectOffplane\(/, 'the historical G5-A driver used the preserving collector');
  assert.match(readFileSync(new URL('../browser/drivers/checks.js', import.meta.url), 'utf8'), /await collectG5d\(/, 'the G5-D driver uses its preserving collector (behaviour: tests/g5d-qualification.test.mjs)');
});

// --- 3. baseline authentication ------------------------------------------------------------------------------------------------------------
test('r1-3: loadBaseline refuses a baseline whose records fail verification, rather than reading them as comparison unavailable', async () => {
  const Q = await import('../qualify.mjs');
  const fake = { load: async () => ({ manifest: { fixture: {} }, records: [{ id: 'G1-headed-x', gate: 'G1', identity: { mode: 'headed' } }], attempts: [] }), fixturesOf: async () => ({}) };
  await assert.rejects(Q.loadBaseline('m.json', { ...fake, verify: async () => ({ raws: {}, errors: { 'G1-headed-x': 'artefact hash mismatch: x.raw.json' } }) }), /attempt-1 baseline .* failed verification: G1-headed-x: artefact hash mismatch/);
  const ok = await Q.loadBaseline('m.json', { ...fake, verify: async () => ({ raws: { 'G1-headed-x': { adapterInfo: { grantedFeatures: [] } } }, errors: {} }) });
  assert.equal(ok.records.length, 1);
});

// --- 1. read-time recomputation of invalid G5 records ---------------------------------------------------------------------------------------
async function scratch() { const dir = resolve(ROOT, 'artifacts/runtime'); await mkdir(dir, { recursive: true }); return mkdtemp(join(dir, 'p0-r1-')); }
const args = ['--enable-gpu', DEVELOPER_FLAG];
async function put(root, id, raw, invalidations, metrics = {}) {
  const d = join(root, 'artifacts/project0', 'run'); await mkdir(d, { recursive: true });
  const launch = { requestedArgs: args, commandLine: `chrome ${args.join(' ')} --user-data-dir=/p`, profile: '/p', mode: 'headed' }, rt = JSON.stringify(raw), lt = JSON.stringify(launch);
  await writeFile(join(d, `${id}.raw.json`), rt); await writeFile(join(d, `${id}.launch.json`), lt);
  return { schema: 1, id, gate: 'G5', slot: 'qjulia-offplane', campaign: 'webgpu-remediation', experiment: false, invalidations, metrics, identity: { mode: 'headed', ...launchIdentity(launch) },
    artifacts: [{ path: `run/${id}.raw.json`, sha256: sha256(rt) }, { path: `run/${id}.launch.json`, sha256: sha256(lt) }] };
}
const acquisitions = [{ epoch: 1, requestedFeatures: [], features: [], grantedFeatures: [] }];

test('r1-1: recompute rederives an invalid G5 record\'s compensation observations and frozen ratio from its raw; a ratio above 1 is a numerical failure', async () => {
  const { recompute } = await import('../qualify.mjs');
  const { metrics } = await import('../measure/arith.mjs');
  const root = await scratch();
  try {
    const raw = { ...rawFor({ updates: 'DB', offplane: 'DB' }), acquisitions };
    let honest; try { metrics('G5', 'qjulia-offplane', raw, fx); } catch (e) { honest = e.message; }
    assert.ok(honest);
    const rec = await put(root, 'G5-db', raw, [`metrics: ${honest}`]);
    const out = await recompute([rec], fx, { root, manifest: { requestedArgs: args }, collect: true, baseline: { records: [], raws: {} } });
    assert.deepEqual(out.errors, {});
    const o = out.g5Observations?.['G5-db'];
    assert.ok(o, 'an observation is recomputed for the invalid record');
    assert.equal(o.componentRatio, 2.28481606431775); assert.equal(o.numericalFailure, true);
    assert.equal(o.compensation.validated, false); assert.deepEqual(o.compensation.matches, ['DB']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('r1-1: a saved failure description that its raw does not reproduce is refused at read time', async () => {
  const { recompute } = await import('../qualify.mjs');
  const root = await scratch();
  try {
    const lie = 'metrics: compensation unvalidated: x; observations match model(s) F; frozen off-plane comparison recorded separately: componentRatio=0.5';
    const db = await put(root, 'G5-lie', { ...rawFor({ updates: 'DB', offplane: 'DB' }), acquisitions }, [lie]);
    const good = await put(root, 'G5-good', { ...rawFor({}), acquisitions }, ['metrics: compensation unvalidated: invented']);
    const other = await put(root, 'G5-lost', { ...rawFor({}), acquisitions }, ['device lost: unknown'], { components: 32, componentRatio: 0.8883912804919689 });
    const out = await recompute([db, good, other], fx, { root, manifest: { requestedArgs: args }, collect: true, baseline: { records: [], raws: {} } });
    assert.match(out.errors['G5-lie'] ?? '', /saved G5 observation does not recompute/);
    assert.match(out.errors['G5-good'] ?? '', /saved G5 observation does not recompute/);
    assert.equal(out.errors['G5-lost'], undefined, 'an invalidation from elsewhere is kept; the observation still recomputes');
    assert.equal(out.g5Observations['G5-lost'].compensation.validated, true); assert.equal(out.g5Observations['G5-lost'].numericalFailure, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// --- fix round 2 (Codex run 20261020T012231Z-93d3): an honestly incomplete G5 invocation, writer to reader ---------------------------------
test('r2-1: finalise → recompute: a synthetic G5/incomplete record keeps its failure, collects no observation, and neither collected nor closure-mode recompute rejects it', async () => {
  const { finalise } = await import('../run.mjs');
  const { recompute } = await import('../qualify.mjs');
  const root = await scratch();
  try {
    const runDir = join(root, 'run'); await mkdir(runDir, { recursive: true });
    const launchInfo = { args: 'remediation', requestedArgs: args, commandLine: `chrome ${args.join(' ')} --user-data-dir=/p`, profile: '/p', mode: 'headed' };
    const identity = { mode: 'headed', ...launchIdentity(launchInfo) };
    const common = { gate: 'G5', mode: 'headed', campaign: 'webgpu-remediation', runDir, identity, launchInfo, chromeGpuText: '', fixtures: fx, experiment: false };
    // acquisition failed before any slot completed: no result at all
    const incomplete = await finalise({ ...common, invalidations: ['session: browser hang: launch exceeded 60000 ms'], outcome: null });
    assert.deepEqual(incomplete.map(r => r.slot), ['incomplete']);
    // a second invocation whose real off-plane slot completed with DB words (an invalid record that must still be recomputed)
    const runDir2 = join(root, 'run2'); await mkdir(runDir2, { recursive: true });
    const real = await finalise({ ...common, runDir: runDir2, invalidations: [], outcome: { result: { slots: [{ slot: 'qjulia-offplane', raw: { ...rawFor({ updates: 'DB', offplane: 'DB' }) }, timingMethod: { kind: 'correctness-only' } }], invalidations: [], acquisitions } } });
    const records = [...incomplete, ...real];
    const collected = await recompute(records, fx, { manifest: { requestedArgs: args }, collect: true, baseline: { records: [], raws: {} } });
    assert.deepEqual(collected.errors, {}, 'no spurious verification error');
    assert.deepEqual(collected.g5Observations[incomplete[0].id], { slot: 'incomplete', collected: false });
    assert.equal(collected.g5Observations[real[0].id].numericalFailure, true); assert.deepEqual(collected.g5Observations[real[0].id].compensation.matches, ['DB']);
    const closing = await recompute(records, fx, { manifest: { requestedArgs: args }, baseline: { records: [], raws: {} } });   // close-remediation's default: throws on any error
    assert.equal(Object.keys(closing.g5Observations).length, 2);
    assert.ok(incomplete[0].invalidations.some(x => /launch exceeded/.test(x)), 'the original failure is kept');
  } finally { await rm(root, { recursive: true, force: true }); }
});
