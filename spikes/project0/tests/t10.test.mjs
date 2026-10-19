// spikes/project0/tests/t10.test.mjs — T10's reviewed amendments (Codex T9 r7 carry-forward list) and the read-side defects found while
// transcribing qualify.mjs/campaign.mjs. No test launches a browser or requests a GPU: the campaign runs only with injected fakes, and every
// filesystem fixture lives under artifacts/runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ROOT } from '../launch.mjs';
import { sha256, launchIdentity, fixtureIdentity } from '../evidence.mjs';
import { CORRECTNESS_ONLY } from '../timing-contract.js';
import { evaluateGate } from '../gates.js';
import { STOPS } from '../session-utils.mjs';
import { WINDOW_PLANS } from '../supervision-plan.js';
import { evaluatePreflight } from '../integrity-preflight.mjs';

const Q = await import('../qualify.mjs');   // namespace import: a missing export fails its own test, not the whole file
const identity = { backend: 'webgpu', fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64), implementationCommit: 'd'.repeat(40), implementationHash: 'e'.repeat(64), launchHash: 'f'.repeat(64), browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's', mode: 'headless' };
const implementation = { implementationCommit: identity.implementationCommit, implementationHash: identity.implementationHash };
const fixture = { fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64) };
const rec = (gate, slot, extra = {}) => ({ schema: 1, id: `${gate}-${slot.replace(/[^A-Za-z0-9.-]/g, '_')}-run`, gate, slot, campaign: 'webgpu-1', experiment: false, identity, invalidations: [], artifacts: [{ path: 'r/x.raw.json', sha256: '0'.repeat(64) }], metrics: {}, ...extra });
const base = { fixture, campaign: 'webgpu-1', args: 'attempt1', requestedArgs: ['--enable-gpu'], runDirs: [] };
const eligible = n => Array.from({ length: n }, (_, id) => ({ id, eligible: true }));
const fx = { analytic: { sphere: { rays: Array(625) } }, arithmetic: { bulb: eligible(4096), plane: eligible(4096) }, stability: { cycleCount: 60, cycleMs: 10000 } };
const G4_PASS = { samples: 4096, eligible: 4096, diagnostics: 0, statusErrors: 0, indexErrors: 0, logRRatio: 0.5, deRatio: 0.5 };
const g4 = (extra = {}) => rec('G4', 'bulb-samples', { metrics: G4_PASS, timingMethod: CORRECTNESS_ONLY, ...extra });

async function scratch() { const dir = resolve(ROOT, 'artifacts/runtime'); await mkdir(dir, { recursive: true }); return mkdtemp(join(dir, 'p0-t10-')); }
const launchOf = mode => ({ requestedArgs: ['--enable-gpu'], commandLine: 'chrome --enable-gpu --user-data-dir=/p', profile: '/p', mode });
// Writes a record's raw and launch artefacts (and optionally its supervision sidecar and other files) into <root>/artifacts/project0/<dir>.
async function put(root, dir, record, raw, { sidecar, files = {} } = {}) {
  const d = join(root, 'artifacts/project0', dir); await mkdir(d, { recursive: true });
  const rawText = typeof raw === 'string' ? raw : JSON.stringify(raw), launch = launchOf(record.identity.mode), lt = JSON.stringify(launch);
  await writeFile(join(d, `${record.id}.raw.json`), rawText); await writeFile(join(d, `${record.id}.launch.json`), lt);
  const r = { ...record, identity: { ...record.identity, ...launchIdentity(launch) }, artifacts: [{ path: `${dir}/${record.id}.raw.json`, sha256: sha256(rawText) }, { path: `${dir}/${record.id}.launch.json`, sha256: sha256(lt) }] };
  await writeFile(join(d, `${record.id}.json`), JSON.stringify(r));
  if (sidecar !== undefined) await writeFile(join(d, record.gate === 'G2' ? `supervision-${record.slot}.json` : 'supervision.json'), JSON.stringify(sidecar));
  for (const [name, data] of Object.entries(files)) await writeFile(join(d, name), typeof data === 'string' ? data : JSON.stringify(data));
  return r;
}
// A complete supervision sidecar for an invocation's window plan, in the shape session-utils persists.
const complete = (gate, { windows = WINDOW_PLANS[gate] ?? [] } = {}) => ({ plan: (WINDOW_PLANS[gate] ?? []).map(w => w.name), complete: true, failure: null,
  windows: windows.map((w, i) => ({ name: w.name, id: i + 1, openedAt: 1000 * i, closedAt: 1000 * i + 50, complete: true, ...(w.checkpoints !== undefined ? { checkpoints: w.checkpoints, expectedCheckpoints: w.checkpoints } : {}) })) });

// --- 1. Read-time wrapper: evaluateGateChecked with raws, original invalidations kept --------------------------------------------------------
test('qualify: every verdict comes from evaluateGateChecked with the raw payloads; the original invalidations stay beside the timing reason', () => {
  const r = g4(), m = Q.buildManifest({ ...base, records: [r] }), raws = { [r.id]: {} };
  assert.equal(Q.qualify(m, [r], fx, { raws }).backend.gates.G4.status, 'pass');
  const bare = g4(); delete bare.timingMethod;
  assert.equal(evaluateGate('G4', [bare], m, fx).status, 'pass', 'the frozen evaluator ignores timingMethod: why the wrapper is required');
  const unchecked = Q.qualify(m, [bare], fx, { raws }).backend.gates.G4;
  assert.equal(unchecked.status, 'invalid/inconclusive'); assert.match(unchecked.reasons[0], /^timing method/);
  const noRaws = Q.qualify(m, [r], fx).backend.gates.G4;
  assert.equal(noRaws.status, 'invalid/inconclusive', 'a verdict without the raws map is refused'); assert.match(noRaws.reasons.join(' '), /raws map/);
  const lost = { ...bare, invalidations: ['device lost: unknown'] };
  const both = Q.qualify(m, [lost], fx, { raws }).backend.gates.G4;
  assert.equal(both.status, 'invalid/inconclusive');
  assert.ok(both.reasons.some(x => /^timing method/.test(x)), 'the timing reason'); assert.ok(both.reasons.includes('device lost: unknown'), 'and the original invalidation');
});

// --- 2. recompute returns every record's raw payload, invalidated ones included --------------------------------------------------------------
test('recompute parses and returns every selected record\'s raw payload keyed by record id, invalidated records included', async () => {
  const root = await scratch();
  try {
    const a = await put(root, 'r', rec('G6', 'bulb-overview/0', { invalidations: ['G7 schedule deviation: x'] }), { windowStart: 1, observedMs: 2 });
    const b = await put(root, 'r', rec('G4', 'bulb-samples', { invalidations: ['incomplete: the session produced no result'] }), { error: 'no result' });
    const out = await Q.recompute([a, b], fx, { root, manifest: { requestedArgs: ['--enable-gpu'] } });
    assert.deepEqual(out.raws, { [a.id]: { windowStart: 1, observedMs: 2 }, [b.id]: { error: 'no result' } });
    const bad = await put(root, 's', rec('G8', '0', { invalidations: ['x'] }), '{not json');
    await assert.rejects(Q.recompute([bad], fx, { root }), /raw payload/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// --- 3. Supervision sidecars ----------------------------------------------------------------------------------------------------------------
test('supervision: the sidecar must show failure null, complete, the plan\'s windows in order, closed within their bounds, and every checkpoint', () => {
  const p = Q.supervisionProblems;
  assert.deepEqual(p(rec('G1', 'headed'), { plan: [], windows: [], complete: true, failure: null }), [], 'G1: an empty plan (the real T9 shape)');
  assert.deepEqual(p(rec('G8', '3'), complete('G8')), []);
  assert.deepEqual(p(rec('G6', 'bulb-overview/0'), complete('timing')), [], 'G6, G7 and G9 belong to the timing invocation');
  assert.deepEqual(p(rec('G9', 'warmed'), complete('timing')), []);
  assert.deepEqual(p(rec('G12', 'sequence'), complete('G12')), []);
  assert.deepEqual(p(rec('G2', 'fresh-0'), complete('G2')), []);
  const nav = WINDOW_PLANS.G2[0];
  assert.deepEqual(p(rec('G2', 'warm'), complete('G2', { windows: [nav, nav] })), [], 'warm: fresh-2\'s window and the reload\'s');
  assert.ok(p(rec('G2', 'warm'), complete('G2')).length, 'warm with one window');
  assert.ok(p(rec('G8', '0'), null).length, 'missing');
  assert.ok(p(rec('G8', '0'), { ...complete('G8'), failure: 'browser hang: x' }).length, 'failure');
  assert.ok(p(rec('G8', '0'), { ...complete('G8'), complete: false }).length, 'not complete');
  assert.ok(p(rec('G8', '0'), complete('G8', { windows: WINDOW_PLANS.G8.slice(0, 9) })).length, 'a missing window');
  const swapped = complete('G8'); [swapped.windows[0].name, swapped.windows[1].name] = [swapped.windows[1].name, swapped.windows[0].name];
  assert.ok(p(rec('G8', '0'), swapped).length, 'out of plan order');
  const long = complete('G8'); long.windows[4].closedAt = long.windows[4].openedAt + WINDOW_PLANS.G8[4].boundMs + 1;
  assert.ok(p(rec('G8', '0'), long).length, 'over its bound');
  const open = complete('G8'); open.windows[2].closedAt = null;
  assert.ok(p(rec('G8', '0'), open).length, 'never closed');
  const partial = complete('G8'); partial.windows[2].complete = false;
  assert.ok(p(rec('G8', '0'), partial).length, 'a window not complete');
  const short = complete('G12'); short.windows[0].checkpoints = 59;
  assert.ok(p(rec('G12', 'sequence'), short).length, '59 of 60 checkpoints');
  assert.ok(p(rec('G8', '0'), { ...complete('G8'), plan: ['G8/0'] }).length, 'a plan other than the gate\'s');
});

test('recompute: a clean record without a complete supervision sidecar is refused; an invalidated one keeps its evidence', async () => {
  const root = await scratch();
  try {
    const m = { requestedArgs: ['--enable-gpu'] };
    const none = await put(root, 'a', g4(), {});
    await assert.rejects(Q.recompute([none], fx, { root, manifest: m }), /supervision/);
    const failed = await put(root, 'b', g4(), {}, { sidecar: { ...complete('G4'), failure: 'browser hang: x', complete: false } });
    await assert.rejects(Q.recompute([failed], fx, { root, manifest: m }), /supervision/);
    const kept = await put(root, 'c', g4({ invalidations: ['page: browser hang: x'] }), {});
    assert.equal((await Q.recompute([kept], fx, { root, manifest: m })).launches.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// --- 4. G12 checkpoints reconciled against cycleLog ------------------------------------------------------------------------------------------
const cycleLog = overrunAt => Array.from({ length: 60 }, (_, i) => {
  const c0 = 1000 + 10000 * i, ph = (s, e) => ({ plannedStartMs: c0 + s, plannedEndMs: c0 + e, startMs: c0 + s, endMs: c0 + e + 1, skipped: false });
  return { cycle: i, c0, phases: [ph(0, 3000), ph(3000, 4000), ph(4000, 7000)], overrun: i === overrunAt, checkpointSentMs: c0 + 7010, checkpointRepliedMs: i === overrunAt ? c0 + 10050 : c0 + 7012, endedMs: i === overrunAt ? c0 + 10050 : c0 + 10000 };
});
const checkpointsOf = (log, missesBefore) => Object.fromEntries(log.map((c, n) => [n, { cycle: n, t: c.phases.at(-1).endMs + 5, deadlineMisses: missesBefore(n) }]));

test('G12: checkpoint-0 to checkpoint-59 reconcile with cycleLog: cycle identity, a finite t between the last phase end and the send, preceding misses', () => {
  const p = Q.checkpointProblems, log = cycleLog(-1), ok = checkpointsOf(log, () => 0);
  assert.deepEqual(p({ cycleLog: log, deadlineMisses: 0 }, ok, fx), []);
  const over = cycleLog(3);
  assert.deepEqual(p({ cycleLog: over, deadlineMisses: 1 }, checkpointsOf(over, n => (n > 3 ? 1 : 0)), fx), [], 'a genuine overrun stays a recorded miss');
  assert.ok(p({ cycleLog: over, deadlineMisses: 1 }, checkpointsOf(over, () => 0), fx).length, 'a checkpoint after the overrun reporting 0 preceding misses');
  const missing = { ...ok }; delete missing[59];
  assert.ok(p({ cycleLog: log, deadlineMisses: 0 }, missing, fx).length, 'checkpoint-59 missing');
  assert.ok(p({ cycleLog: log, deadlineMisses: 0 }, { ...ok, 60: { cycle: 60, t: 1, deadlineMisses: 0 } }, fx).length, 'an extra checkpoint');
  assert.ok(p({ cycleLog: log, deadlineMisses: 0 }, { ...ok, 7: { ...ok[7], cycle: 8 } }, fx).length, 'a wrong cycle identity');
  assert.ok(p({ cycleLog: log, deadlineMisses: 0 }, { ...ok, 7: { ...ok[7], t: log[7].checkpointSentMs + 1 } }, fx).length, 't after the send');
  assert.ok(p({ cycleLog: log, deadlineMisses: 0 }, { ...ok, 7: { ...ok[7], t: log[7].phases[2].endMs - 1 } }, fx).length, 't before the last phase end');
  assert.ok(p({ cycleLog: log, deadlineMisses: 0 }, { ...ok, 7: { ...ok[7], t: null } }, fx).length, 'a non-finite t');
  assert.ok(p({ cycleLog: log.slice(0, 59), deadlineMisses: 0 }, ok, fx).length, 'a truncated cycleLog');
  assert.ok(p({ cycleLog: log, deadlineMisses: 1 }, ok, fx).length, 'the raw miss count disagrees');
});

test('recompute: a clean G12 record whose checkpoint files do not reconcile is refused before its metrics are rederived', async () => {
  const root = await scratch();
  try {
    const log = cycleLog(-1), cps = checkpointsOf(log, () => 0), files = Object.fromEntries(Object.entries(cps).filter(([n]) => n !== '59').map(([n, c]) => [`checkpoint-${n}.json`, c]));
    const r = await put(root, 'g12', rec('G12', 'sequence', { identity: { ...identity, mode: 'headed' } }), { cycleLog: log, deadlineMisses: 0 }, { sidecar: complete('G12'), files });
    await assert.rejects(Q.recompute([r], fx, { root, manifest: { requestedArgs: ['--enable-gpu'] } }), /do not reconcile with its cycleLog/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// --- 5. G9 bound through validateSources against companions of the same invocation ---------------------------------------------------------
test('G9: every source window is bound to a validated companion record of the same invocation (validateSources)', () => {
  const g6 = { ...rec('G6', 'bulb-overview/0'), artifacts: [{ path: 't1/g6.raw.json', sha256: '0'.repeat(64) }] };
  const g9 = { ...rec('G9', 'warmed'), artifacts: [{ path: 't1/g9.raw.json', sha256: '0'.repeat(64) }] };
  const src = { gate: 'G6', slot: 'bulb-overview/0', windowStart: 1000, windowEnd: 31000 };
  const raws = { [g6.id]: { windowStart: 1000, observedMs: 30000 }, [g9.id]: { sources: [src] } };
  assert.deepEqual(Q.sourceProblems(g9, [g6, g9], raws), []);
  const elsewhere = { ...g6, artifacts: [{ path: 't2/g6.raw.json', sha256: '0'.repeat(64) }] };
  assert.match(Q.sourceProblems(g9, [elsewhere, g9], raws).join(), /no companion/, 'a companion from another invocation does not count');
  assert.match(Q.sourceProblems(g9, [{ ...g6, invalidations: ['G7 schedule deviation: x'] }, g9], raws).join(), /is invalid/);
  assert.match(Q.sourceProblems(g9, [g6, g9], { ...raws, [g9.id]: { sources: [{ ...src, windowEnd: 31001 }] } }).join(), /companion observed/);
  assert.match(Q.sourceProblems(g9, [g6, g9], { ...raws, [g9.id]: {} }).join(), /names no source windows/, 'a G9 raw naming no sources');
});

test('recompute: a clean G9 record whose sources have no validated companion is refused before its metrics are rederived', async () => {
  const root = await scratch();
  try {
    const raw = { sources: [{ gate: 'G6', slot: 'bulb-overview/0', windowStart: 1000, windowEnd: 31000 }] };
    const r = await put(root, 't', rec('G9', 'warmed', { identity: { ...identity, mode: 'headed' } }), raw, { sidecar: complete('timing') });
    await assert.rejects(Q.recompute([r], fx, { root, manifest: { requestedArgs: ['--enable-gpu'] } }), /not bound to validated companions/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// --- 6. ABORTS is the shared classifier, including the T7 stop -----------------------------------------------------------------------------
test('ABORTS derives from session-utils STOPS, including submission completion rejected', () => {
  assert.equal(Q.ABORTS.length, STOPS.length);
  const reasons = r => Q.ABORTS.map(f => f(r)).filter(Boolean);
  assert.deepEqual(reasons(rec('G6', 'bulb-overview/0', { invalidations: ['page: aborted: submission-failed: GPUValidationError'] })), ['submission completion rejected']);
  assert.deepEqual(reasons(rec('G6', 'bulb-overview/0', { invalidations: ['page: aborted: submission-failed-late'] })), [], 'a longer kind sharing the prefix is not this stop');
});

// --- 7. loadCampaign never selects a supervision sidecar or checkpoint as a record ---------------------------------------------------------
test('loadCampaign reads only records from a run directory: supervision sidecars and checkpoints are not records', async () => {
  const root = await scratch();
  try {
    const r = await put(root, 'c1', g4(), {}, { sidecar: complete('G4'), files: { 'checkpoint-0.json': { cycle: 0 } } });
    const manifest = { ...base, runDirs: ['c1'], trials: { 'G4/bulb-samples': { id: r.id, identity: r.identity } }, notRun: {}, reuse: [] };
    await writeFile(join(root, 'm.json'), JSON.stringify(manifest));
    const { records } = await Q.loadCampaign('m.json', { root });
    assert.deepEqual(records.map(x => x.id), [r.id]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('loadFixtures accepts the frozen fixtures.json under its own identity and refuses another hash (regression check)', async () => {
  const fixture = await fixtureIdentity();
  const loaded = await Q.loadFixtures({ fixture }, { provenance: false });
  assert.ok(loaded.stability && loaded.arithmetic);
  await assert.rejects(Q.loadFixtures({ fixture: { ...fixture, fixtureHash: '9'.repeat(64) } }, { provenance: false }), /fixture hash/);
});

// --- 8. The integrity preflight ----------------------------------------------------------------------------------------------------------------
const pageLoad = () => ({ transport: 'p0Push', sameTaskRevert: { violations: ['unexpected backing 800x720 at 21'] }, undeliveredAtStop: { violations: ['unexpected backing 640x720 at 23'] },
  allowedResizes: { violations: [], events: [{ deliberate: true }, { deliberate: true }, { deliberate: true }] },
  statusVisibility: { position: 'fixed', offsetParentNull: true, visible: true, controls: { visibleFixed: true, displayNone: false, visibilityHidden: false, zeroSize: false, opacityZero: false, offscreen: false } } });
const preflightRecord = (impl = implementation, over = {}) => {
  const first = { slots: [{ raw: pageLoad() }] }, reload = { slots: [{ raw: pageLoad() }] };
  const { assertions } = evaluatePreflight({ first: first.slots[0].raw, reload: reload.slots[0].raw, evaluates: 0 });
  return { schema: 1, kind: 'integrity-preflight', pass: true, assertions, evaluates: 0, mode: 'headed', errors: [], implementation: impl, first, reload, ...over };
};

test('preflight: a passing seven-assertion record at the exact implementation, recomputed from its saved page results', () => {
  const p = Q.preflightProblems;
  assert.deepEqual(p(preflightRecord(), implementation), []);
  assert.ok(p(preflightRecord(), { ...implementation, implementationCommit: '1'.repeat(40) }).length, 'another commit');
  assert.ok(p(preflightRecord(), { ...implementation, implementationHash: '1'.repeat(64) }).length, 'another implementation hash');
  assert.ok(p(preflightRecord(implementation, { pass: false }), implementation).length);
  assert.ok(p(preflightRecord(implementation, { errors: ['page error: x'] }), implementation).length);
  assert.ok(p(preflightRecord(implementation, { evaluates: 1 }), implementation).length);
  assert.ok(p(preflightRecord(implementation, { mode: 'headless' }), implementation).length);
  const six = preflightRecord(); six.assertions = six.assertions.slice(0, 6);
  assert.ok(p(six, implementation).length, 'six assertions (the pre-fix-round-5 preflight)');
  const forged = preflightRecord(); forged.first.slots[0].raw.statusVisibility.visible = false;
  assert.ok(p(forged, implementation).length, 'saved page results that do not reproduce the recorded verdict');
  assert.ok(p(null, implementation).length);
});

test('verifyPreflight (read side): the manifest names a passing preflight whose implementation is the selected records\'', async () => {
  const root = await scratch();
  try {
    await mkdir(join(root, 'artifacts/project0/pf'), { recursive: true });
    await writeFile(join(root, 'artifacts/project0/pf/integrity-preflight.json'), JSON.stringify(preflightRecord()));
    const manifest = { reuse: [], preflight: { runDir: 'pf', ...implementation } }, records = [g4()];
    await Q.verifyPreflight(manifest, records, { root });
    await assert.rejects(Q.verifyPreflight({ reuse: [] }, records, { root }), /preflight/);
    await assert.rejects(Q.verifyPreflight(manifest, [g4({ identity: { ...identity, implementationCommit: '1'.repeat(40) } })], { root }), /preflight/);
    await assert.rejects(Q.verifyPreflight({ ...manifest, preflight: { ...manifest.preflight, runDir: 'missing' } }, records, { root }), /preflight/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// --- 9. The campaign, with injected fakes only (never a browser) ---------------------------------------------------------------------------
function fakes(sessions = {}, over = {}) {
  const calls = [], report = {};
  const d = {
    LAUNCH: { attempt1: ['--enable-gpu'] },
    runSession: async o => { calls.push(`session ${o.gate} ${o.mode}`); return { records: sessions[`${o.gate} ${o.mode}`] ?? [], runDir: `/x/${o.gate}-${o.mode}` }; },
    runG2: async () => { calls.push('g2'); return { records: [], runDir: '/x/g2' }; },
    runPreflight: async o => { calls.push(`preflight ${o.mode}`); return { pass: true, record: preflightRecord(), runDir: '/x/pf' }; },
    implementationIdentity: async () => implementation,
    fixtureIdentity: async () => fixture,
    readFixtures: async () => fx,
    loadCampaign: async () => { throw new Error('no reuse here'); },
    recompute: async records => ({ records, launches: [], raws: Object.fromEntries(records.map(r => [r.id, {}])) }),
    writeReport: async (name, manifest, gates) => { calls.push(`report ${name}`); Object.assign(report, { manifest, gates }); },
    log: () => {},
    ...over };
  return { d, calls, report };
}

test('campaign: modes per invocation, G2 headed through runG2, correctness before performance before stability', async () => {
  const { PHASES } = await import('../campaign.mjs');
  assert.deepEqual(PHASES.map(([phase, steps]) => [phase, steps.map(s => s.join(' '))]), [
    ['correctness', ['G1 headed', 'G1 headless', 'G4 headless', 'G5 headless', 'G3 headless', 'G11 headed', 'G13 headed']],
    ['performance', ['G2 headed', 'timing headed', 'G8 headed', 'G10 headed']],
    ['stability', ['G12 headed']]]);
  const { runCampaign } = await import('../campaign.mjs');
  const { d, calls } = fakes();
  await runCampaign({ name: 'webgpu-1', gates: 'G2' }, d);
  assert.deepEqual(calls, ['preflight headed', 'g2', 'report webgpu-1'], 'G2 is the headed runG2 invocation, after the preflight');
});

test('campaign: refuses to start without its dependencies, under a non-qualifying name, or without a passing preflight at this implementation', async () => {
  const { runCampaign } = await import('../campaign.mjs');
  await assert.rejects(runCampaign({ name: 'webgpu-1' }, {}), /dependency/);
  for (const name of ['dev', 'probe', 'precision', undefined, 'Bad Name']) {
    const { d, calls } = fakes();
    await assert.rejects(runCampaign({ name }, d), /qualifying campaign/);
    assert.deepEqual(calls, [], `${name}: nothing runs`);
  }
  const failing = fakes({}, { runPreflight: async () => ({ pass: false, record: preflightRecord(implementation, { pass: false }), runDir: '/x/pf' }) });
  await assert.rejects(runCampaign({ name: 'webgpu-1' }, failing.d), /integrity preflight/);
  assert.equal(failing.calls.filter(c => !c.startsWith('preflight')).length, 0, 'no gate runs after a failed preflight');
  const stale = fakes({}, { implementationIdentity: async () => ({ ...implementation, implementationHash: '1'.repeat(64) }) });
  await assert.rejects(runCampaign({ name: 'webgpu-1' }, stale.d), /integrity preflight/);
  assert.equal(stale.calls.filter(c => !c.startsWith('preflight')).length, 0, 'a preflight of another implementation does not count');
});

test('campaign: the correctness verdict is the checked one, so an unchecked pass cannot open the performance phase; the manifest names the preflight', async () => {
  const { runCampaign } = await import('../campaign.mjs');
  const bare = g4(); delete bare.timingMethod;
  const stopped = fakes({ 'G4 headless': [bare] });
  const out = await runCampaign({ name: 'webgpu-1', gates: 'G4,G8' }, stopped.d);
  assert.ok(!stopped.calls.includes('session G8 headed'), 'G8 never runs');
  assert.match(out.stopped, /correctness gate G4 is invalid\/inconclusive/);
  assert.equal(stopped.report.manifest.notRun.G8.status, 'not run');
  const clean = fakes({ 'G4 headless': [g4()] });
  const ok = await runCampaign({ name: 'webgpu-1', gates: 'G4,G8' }, clean.d);
  assert.ok(clean.calls.includes('session G8 headed'), 'a checked pass opens the performance phase');
  assert.equal(ok.backend.gates.G4.status, 'pass');
  assert.deepEqual(clean.report.manifest.preflight, { runDir: 'pf', ...implementation });
});
