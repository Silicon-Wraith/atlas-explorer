// spikes/project0/tests/t10.test.mjs — T10's reviewed amendments (Codex T9 r7 carry-forward list) and the read-side defects found while
// transcribing qualify.mjs/campaign.mjs. No test launches a browser or requests a GPU: the campaign runs only with injected fakes, and every
// filesystem fixture lives under artifacts/runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ROOT } from '../launch.mjs';
import { sha256, launchIdentity, fixtureIdentity } from '../evidence.mjs';
import { CORRECTNESS_ONLY, EXPECTED_TIMING, notMeasured } from '../timing-contract.js';
import { evaluateGate, gatePlan } from '../gates.js';
import { STOPS } from '../session-utils.mjs';
import { WINDOW_PLANS } from '../supervision-plan.js';
import { evaluatePreflight, runIntegrityPreflight } from '../integrity-preflight.mjs';

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
async function put(root, dir, record, raw, { sidecar, files = {}, launch: launchInfo } = {}) {
  const d = join(root, 'artifacts/project0', dir); await mkdir(d, { recursive: true });
  const rawText = typeof raw === 'string' ? raw : JSON.stringify(raw), launch = launchInfo ?? launchOf(record.identity.mode), lt = JSON.stringify(launch);
  await writeFile(join(d, `${record.id}.raw.json`), rawText); await writeFile(join(d, `${record.id}.launch.json`), lt);
  const r = { ...record, identity: { ...record.identity, ...launchIdentity(launch) }, artifacts: [{ path: `${dir}/${record.id}.raw.json`, sha256: sha256(rawText) }, { path: `${dir}/${record.id}.launch.json`, sha256: sha256(lt) }] };
  await writeFile(join(d, `${record.id}.json`), JSON.stringify(r));
  if (sidecar !== undefined) await writeFile(join(d, record.gate === 'G2' ? `supervision-${record.slot}.json` : 'supervision.json'), JSON.stringify(sidecar));
  for (const [name, data] of Object.entries(files)) await writeFile(join(d, name), typeof data === 'string' ? data : JSON.stringify(data));
  return r;
}
// The manifest bindings of a run directory's auxiliary evidence (fix round 1, finding 5), computed independently of qualify.mjs.
const AUX = /^(supervision[A-Za-z0-9.-]*|checkpoint-\d+|integrity-preflight)\.json$/;
async function bind(root, dir) {
  const out = {};
  for (const name of await readdir(join(root, 'artifacts/project0', dir))) if (AUX.test(name)) out[`${dir}/${name}`] = sha256(await readFile(join(root, 'artifacts/project0', dir, name)));
  return out;
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
    await assert.rejects(Q.recompute([failed], fx, { root, manifest: { ...m, bindings: await bind(root, 'b') } }), /supervision/);
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
    await assert.rejects(Q.recompute([r], fx, { root, manifest: { requestedArgs: ['--enable-gpu'], bindings: await bind(root, 'g12') } }), /do not reconcile with its cycleLog/);
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
    await assert.rejects(Q.recompute([r], fx, { root, manifest: { requestedArgs: ['--enable-gpu'], bindings: await bind(root, 't') } }), /not bound to validated companions/);
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
const ARGS = ['--enable-gpu'];
const pageLoad = () => ({ transport: 'p0Push', sameTaskRevert: { violations: ['unexpected backing 800x720 at 21'] }, undeliveredAtStop: { violations: ['unexpected backing 640x720 at 23'] },
  allowedResizes: { violations: [], events: [{ deliberate: true }, { deliberate: true }, { deliberate: true }] },
  statusVisibility: { position: 'fixed', offsetParentNull: true, visible: true, controls: { visibleFixed: true, displayNone: false, visibilityHidden: false, zeroSize: false, opacityZero: false, offscreen: false } } });
const preflightRecord = (impl = implementation, over = {}) => {
  const first = { slots: [{ raw: pageLoad() }] }, reload = { slots: [{ raw: pageLoad() }] };
  const { assertions } = evaluatePreflight({ first: first.slots[0].raw, reload: reload.slots[0].raw, evaluates: 0 });
  return { schema: 1, kind: 'integrity-preflight', pass: true, assertions, evaluates: 0, mode: 'headed', errors: [], implementation: impl,
    launch: { commandLine: 'chrome --enable-gpu --user-data-dir=/p', profile: '/p', requestedArgs: [...ARGS] }, first, reload, ...over };
};

test('preflight: a passing seven-assertion record at the exact implementation and launch configuration, recomputed from its saved page results', () => {
  const p = (r, i, a = ARGS) => Q.preflightProblems(r, i, a);
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

test('fix round 1, finding 9: the preflight runs with, records and is checked against the campaign\'s own launch configuration', async () => {
  const remediation = ['--enable-gpu', '--use-angle=vulkan', '--enable-unsafe-webgpu'];
  assert.ok(Q.preflightProblems(preflightRecord(), implementation, remediation).length, 'an attempt-1 preflight does not support a remediation campaign');
  const unsandboxed = preflightRecord(implementation, { launch: { commandLine: 'chrome --enable-gpu --no-sandbox', profile: '/p', requestedArgs: [...ARGS] } });
  assert.ok(Q.preflightProblems(unsandboxed, implementation, ARGS).length, 'an unsandboxed preflight');
  // integrity-preflight.mjs launches with the configuration it is given (fakes only: no browser)
  let launchedWith = null;
  const page = { on() {}, evaluate: async () => {}, goto: async () => {}, reload: async () => {}, bringToFront: async () => {}, close: async () => {} };
  const raw = pageLoad();
  await runIntegrityPreflight({ args: remediation, totalMs: 2000, deps: {
    startServer: async () => ({ url: 'http://x', stop: async () => {} }),
    launchChrome: async o => { launchedWith = o.args; return { context: { newPage: async () => page, close: async () => {} }, requestedArgs: [...o.args], profile: '/p' }; },
    effectiveCommandLine: async () => `chrome ${remediation.join(' ')}`, newRunDir: async () => '/unused/run', implementationIdentity: async () => implementation,
    installTransport: async () => ({}), waitResult: async () => ({ result: { slots: [{ raw }] } }), writeFile: async () => {} } });
  assert.deepEqual(launchedWith, remediation);
  const { runCampaign } = await import('../campaign.mjs');
  const f = fakes(CORRECT, { LAUNCH: { attempt1: ARGS, remediation }, runPreflight: async o => { f.calls.push(`preflight ${o.args.join(' ')}`); return { pass: true, record: preflightRecord(implementation, { launch: { commandLine: `chrome ${o.args.join(' ')}`, profile: '/p', requestedArgs: [...o.args] } }), runDir: '/x/pf' }; } });
  await runCampaign({ name: 'webgpu-remediation', args: 'remediation', gates: 'G1' }, f.d);
  assert.equal(f.calls[0], `preflight ${remediation.join(' ')}`);
});

test('verifyPreflight (read side): the manifest names and binds a passing preflight at the selected records\' implementation and configuration', async () => {
  const root = await scratch();
  try {
    await mkdir(join(root, 'artifacts/project0/pf'), { recursive: true });
    const file = join(root, 'artifacts/project0/pf/integrity-preflight.json');
    await writeFile(file, JSON.stringify(preflightRecord()));
    const manifest = { reuse: [], requestedArgs: ARGS, preflight: { runDir: 'pf', ...implementation }, bindings: await bind(root, 'pf') }, records = [g4()];
    await Q.verifyPreflight(manifest, records, { root });
    await assert.rejects(Q.verifyPreflight({ ...manifest, preflight: undefined }, records, { root }), /preflight/);
    await assert.rejects(Q.verifyPreflight(manifest, [g4({ identity: { ...identity, implementationCommit: '1'.repeat(40) } })], { root }), /preflight/);
    await assert.rejects(Q.verifyPreflight({ ...manifest, preflight: { ...manifest.preflight, runDir: 'missing' } }, records, { root }), /preflight/);
    await assert.rejects(Q.verifyPreflight({ ...manifest, requestedArgs: ['--other'] }, records, { root }), /preflight/, 'another launch configuration');
    // finding 5: changed bytes that still satisfy every semantic check are refused by the binding
    await writeFile(file, JSON.stringify(preflightRecord(), null, 2));
    await assert.rejects(Q.verifyPreflight(manifest, records, { root }), /bound/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// --- 9. The campaign, with injected fakes only (never a browser) ---------------------------------------------------------------------------
const plan = gatePlan(fx);
// A record whose metrics sit exactly on each rule's bound (so it passes) and whose descriptor is its gate's registered one.
const pass = (gate, slot, mode = 'headed', extra = {}) => rec(gate, slot, { identity: { ...identity, mode }, metrics: Object.fromEntries(Object.entries(plan[gate][slot]).map(([k, [, a]]) => [k, a])), timingMethod: EXPECTED_TIMING[gate][0], ...extra });
const CORRECT = { 'G1 headed': [pass('G1', 'headed')], 'G1 headless': [pass('G1', 'headless', 'headless')], 'G4 headed': [pass('G4', 'bulb-samples')],
  'G5 headed': [pass('G5', 'qjulia-plane'), pass('G5', 'qjulia-offplane')], 'G3 headed': [pass('G3', 'sphere')], 'G11 headed': [pass('G11', '4k')],
  'G13 headed': ['intentional', 'injected', 'repeated'].map(s => pass('G13', s)) };
const rawFor = r => (r.timingMethod?.field ? { [r.timingMethod.field]: 1 } : {});
function fakes(sessions = {}, over = {}) {
  const calls = [], report = {}, recomputed = [];
  const d = {
    LAUNCH: { attempt1: ARGS },
    runSession: async o => { calls.push(`session ${o.gate} ${o.mode}`); return { records: sessions[`${o.gate} ${o.mode}`] ?? [], runDir: `/x/${o.gate}-${o.mode}` }; },
    runG2: async () => { calls.push('g2'); return { records: [], runDir: '/x/g2' }; },
    runPreflight: async o => { calls.push(`preflight ${o.mode}`); return { pass: true, record: preflightRecord(), runDir: '/x/pf' }; },
    implementationIdentity: async () => implementation,
    fixtureIdentity: async () => fixture,
    readFixtures: async () => fx,
    loadCampaign: async () => { throw new Error('no reuse here'); },
    verifyPreflight: async () => {},
    bindAuxiliary: async dir => ({ [`${dir}/supervision.json`]: '1'.repeat(64) }),
    recompute: async records => { recomputed.push(records.map(r => r.id)); return { records, launches: [], raws: Object.fromEntries(records.map(r => [r.id, rawFor(r)])), errors: {} }; },
    writeReport: async (name, manifest, gates) => { calls.push(`report ${name}`); Object.assign(report, { manifest, gates }); },
    log: () => {},
    ...over };
  return { d, calls, report, recomputed };
}

test('campaign: G3, G4 and G5 headed (fix round 1, Codex ruling), G1 in both modes, G2 headed through runG2 after every correctness invocation', async () => {
  const { PHASES, runCampaign } = await import('../campaign.mjs');
  assert.deepEqual(PHASES.map(([phase, steps]) => [phase, steps.map(s => s.join(' '))]), [
    ['correctness', ['G1 headed', 'G1 headless', 'G4 headed', 'G5 headed', 'G3 headed', 'G11 headed', 'G13 headed']],
    ['performance', ['G2 headed', 'timing headed', 'G8 headed', 'G10 headed']],
    ['stability', ['G12 headed']]]);
  const { d, calls } = fakes(CORRECT);
  await runCampaign({ name: 'webgpu-1' }, d);
  assert.deepEqual(calls.slice(0, 10), ['preflight headed', 'session G1 headed', 'session G1 headless', 'session G4 headed', 'session G5 headed', 'session G3 headed', 'session G11 headed', 'session G13 headed', 'g2', 'session timing headed']);
});

test('fix round 1, finding 3: --gates names the rerun set; it never waives the correctness prerequisites (reused correctness evidence is evaluated)', async () => {
  const { runCampaign } = await import('../campaign.mjs');
  const bare = fakes();
  const out = await runCampaign({ name: 'webgpu-1', gates: 'G2' }, bare.d);
  assert.ok(!bare.calls.includes('g2'), 'no performance work without passing correctness evidence');
  assert.match(out.stopped, /correctness gate G1/);
  assert.ok(bare.calls.includes('report webgpu-1'));
  // the same request with every correctness slot supplied by verified reuse opens the performance phase
  const records = Object.values(CORRECT).flat(), source = { campaign: 'webgpu-1', trials: Object.fromEntries(records.map(r => [`${r.gate}/${r.slot}`, { id: r.id }])) };
  const reuse = records.map(r => ({ gate: r.gate, slot: r.slot, fromManifest: 'docs/reports/project0/webgpu-1-manifest.json', recordId: r.id, reason: 'unaffected by the change set' }));
  const reused = fakes({}, { loadCampaign: async () => ({ manifest: source, records, attempts: [] }) });
  await runCampaign({ name: 'webgpu-remediation', gates: 'G2', reuse: JSON.stringify(reuse) }, reused.d);
  assert.ok(reused.calls.includes('g2'));
  assert.ok(!reused.calls.some(c => c.startsWith('session G')), 'reused correctness slots are not rerun');
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

test('campaign: the correctness verdict is the checked one, so an unchecked pass cannot open the performance phase; the manifest names and binds the preflight', async () => {
  const { runCampaign } = await import('../campaign.mjs');
  const bare = pass('G4', 'bulb-samples'); delete bare.timingMethod;
  const stopped = fakes({ ...CORRECT, 'G4 headed': [bare] });
  const out = await runCampaign({ name: 'webgpu-1' }, stopped.d);
  assert.ok(!stopped.calls.includes('g2'), 'no performance work');
  assert.match(out.stopped, /correctness gate G4 is invalid\/inconclusive/);
  assert.equal(stopped.report.manifest.notRun.G8.status, 'not run');
  const clean = fakes(CORRECT);
  const ok = await runCampaign({ name: 'webgpu-1' }, clean.d);
  assert.ok(clean.calls.includes('g2'), 'a checked pass opens the performance phase');
  assert.equal(ok.backend.gates.G4.status, 'pass');
  assert.deepEqual(clean.report.manifest.preflight, { runDir: 'pf', ...implementation });
  assert.equal(clean.report.manifest.bindings['pf/supervision.json'], '1'.repeat(64), 'the preflight directory\'s auxiliary evidence is bound');
  assert.equal(clean.report.manifest.bindings['G4-headed/supervision.json'], '1'.repeat(64), 'and every invocation\'s');
});

// --- Fix round 1 (Codex T10 r1) ---------------------------------------------------------------------------------------------------------------
test('fix round 1, finding 1: a null, non-object or incomplete checkpoint payload never reconciles', () => {
  const log = cycleLog(-1), ok = checkpointsOf(log, () => 0), raw = { cycleLog: log, deadlineMisses: 0 };
  assert.ok(Q.checkpointProblems(raw, Object.fromEntries(Object.keys(ok).map(n => [n, null])), fx).length, 'all 60 payloads null');
  for (const bad of [null, false, 0, '', [], { t: ok[5].t, deadlineMisses: 0 }, { cycle: 5, deadlineMisses: 0 }, { cycle: 5, t: ok[5].t }])
    assert.ok(Q.checkpointProblems(raw, { ...ok, 5: bad }, fx).length, `checkpoint 5 = ${JSON.stringify(bad)}`);
});

test('fix round 1, finding 2: an invocation that produced only a synthesized incomplete slot keeps its evidence in the manifest and in its gate\'s verdict', async () => {
  const { runCampaign } = await import('../campaign.mjs');
  const incomplete = rec('G1', 'incomplete', { identity: { ...identity, mode: 'headed' }, timingMethod: notMeasured('incomplete: the session produced no result'),
    invalidations: ['session: browser hang: launch exceeded 60000 ms', 'incomplete: the session produced no result'] });
  const f = fakes({ ...CORRECT, 'G1 headed': [incomplete] });
  const out = await runCampaign({ name: 'webgpu-1' }, f.d);
  assert.ok(f.report.manifest.attempts[incomplete.id], 'the attempt is named in the manifest');
  assert.ok(out.backend.gates.G1.evidenceIds.includes(incomplete.id), 'and in G1\'s evidence');
  assert.ok(out.backend.gates.G1.reasons.some(x => x.includes('session: browser hang: launch exceeded 60000 ms')), 'with its original reason');
  assert.equal(out.backend.gates.G1.status, 'invalid/inconclusive');
  assert.ok(f.recomputed.at(-1).includes(incomplete.id), 'the attempt is verified with the selection');
  // read side: an attempt is never a selected slot, and must be the manifest's own
  const m = Q.buildManifest({ ...base, records: [], attempts: [incomplete] });
  assert.equal(Q.qualify(m, [], fx, { raws: { [incomplete.id]: {} }, attempts: [incomplete] }).backend.gates.G1.status, 'invalid/inconclusive');
  assert.throws(() => Q.qualify(m, [], fx, { raws: {}, attempts: [{ ...incomplete, id: 'other' }] }), /attempt/);
  assert.throws(() => Q.buildManifest({ ...base, records: [], attempts: [{ ...incomplete, campaign: 'dev' }] }), /campaign/);
});

test('fix round 1, finding 4: a verification failure still writes a report; the affected gates are invalid/inconclusive, never measured failures', async () => {
  const { runCampaign } = await import('../campaign.mjs');
  const g4id = CORRECT['G4 headed'][0].id;
  const rejected = fakes(CORRECT, { recompute: async records => ({ records, launches: [], raws: Object.fromEntries(records.map(r => [r.id, rawFor(r)])), errors: { [g4id]: `artefact hash mismatch: x/${g4id}.raw.json` } }) });
  const out = await runCampaign({ name: 'webgpu-1' }, rejected.d);
  assert.ok(rejected.calls.includes('report webgpu-1'));
  assert.equal(out.backend.gates.G4.status, 'invalid/inconclusive');
  assert.ok(out.backend.gates.G4.reasons.some(x => /verification: .*artefact hash mismatch/.test(x)));
  const thrown = fakes(CORRECT, { recompute: async () => { throw new Error('artefact hash mismatch: unexpected'); } });
  const failed = await runCampaign({ name: 'webgpu-1' }, thrown.d);
  assert.ok(thrown.calls.includes('report webgpu-1'), 'an exception in verification still reports');
  assert.match(thrown.report.manifest.verificationFailure, /artefact hash mismatch/);
  assert.equal(failed.decision.outcome, 'inconclusive');
  assert.ok(Object.values(failed.backend.gates).every(g => g.status !== 'pass' && g.status !== 'fail'), 'no gate passes or fails on unverified evidence');
  // the real recompute collects per-record failures when asked
  const root = await scratch();
  try {
    const r = await put(root, 'h', g4({ invalidations: ['x'] }), {});
    r.artifacts[0] = { ...r.artifacts[0], sha256: '9'.repeat(64) };
    const res = await Q.recompute([r], fx, { root, manifest: { requestedArgs: ARGS }, collect: true });
    assert.match(res.errors[r.id], /artefact hash mismatch/);
    await assert.rejects(Q.recompute([r], fx, { root, manifest: { requestedArgs: ARGS } }), /artefact hash mismatch/, 'and throws when not');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fix round 1, finding 5: supervision and checkpoint bytes are bound by the manifest; semantically valid edits are refused', async () => {
  const root = await scratch();
  try {
    const m = { requestedArgs: ARGS };
    const sup = await put(root, 's', g4(), {}, { sidecar: complete('G4') });
    const bindings = await bind(root, 's');
    await writeFile(join(root, 'artifacts/project0/s/supervision.json'), JSON.stringify(complete('G4'), null, 1));   // same meaning, other bytes
    await assert.rejects(Q.recompute([sup], fx, { root, manifest: { ...m, bindings } }), /bound/);
    await assert.rejects(Q.recompute([sup], fx, { root, manifest: m }), /bound/, 'an unbound sidecar');
    const log = cycleLog(-1), cps = checkpointsOf(log, () => 0), files = Object.fromEntries(Object.entries(cps).map(([n, c]) => [`checkpoint-${n}.json`, c]));
    const g12 = await put(root, 'c', rec('G12', 'sequence', { identity: { ...identity, mode: 'headed' } }), { cycleLog: log, deadlineMisses: 0 }, { sidecar: complete('G12'), files });
    const b12 = await bind(root, 'c');
    await writeFile(join(root, 'artifacts/project0/c/checkpoint-7.json'), JSON.stringify({ ...cps[7], t: cps[7].t + 1 }));   // still within its window
    await assert.rejects(Q.recompute([g12], fx, { root, manifest: { ...m, bindings: b12 } }), /checkpoint-7\.json.*bound/);
    // the binding helper hashes exactly the auxiliary files
    await writeFile(join(root, 'artifacts/project0/c/integrity-preflight.json'), '{}');
    const aux = await Q.auxiliaryHashes('c', { root });
    assert.deepEqual(Object.keys(aux).sort(), Object.keys(await bind(root, 'c')).sort());
    assert.ok(!Object.keys(aux).some(k => k.endsWith('.raw.json') || k.endsWith('.launch.json') || k.endsWith(`${g12.id}.json`)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fix round 1, finding 6: a saved launch with --no-sandbox or --disable-gpu-watchdog, or missing a requested flag, is refused at read time', async () => {
  const root = await scratch();
  try {
    const m = { requestedArgs: ['--enable-gpu', '--use-angle=vulkan'] };
    const launch = commandLine => ({ requestedArgs: [...m.requestedArgs], commandLine: `${commandLine} --user-data-dir=/p`, profile: '/p', mode: 'headless' });
    const ok = await put(root, 'a', g4({ invalidations: ['x'] }), {}, { launch: launch('chrome --enable-gpu --use-angle=vulkan') });
    assert.equal((await Q.recompute([ok], fx, { root, manifest: m })).launches.length, 1);
    const ns = await put(root, 'b', g4({ invalidations: ['x'] }), {}, { launch: launch('chrome --enable-gpu --use-angle=vulkan --no-sandbox') });
    await assert.rejects(Q.recompute([ns], fx, { root, manifest: m }), /sandbox/);
    const wd = await put(root, 'c', g4({ invalidations: ['x'] }), {}, { launch: launch('chrome --enable-gpu --use-angle=vulkan --disable-gpu-watchdog') });
    await assert.rejects(Q.recompute([wd], fx, { root, manifest: m }), /watchdog/);
    const absent = await put(root, 'd', g4({ invalidations: ['x'] }), {}, { launch: launch('chrome --enable-gpu') });
    await assert.rejects(Q.recompute([absent], fx, { root, manifest: m }), /absent from the effective command line/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fix round 1, finding 7: reuse prerequisites are checked on read, and each source campaign\'s own preflight is verified', async () => {
  const old = g4({ campaign: 'webgpu-0' });
  const reuse = [{ gate: 'G4', slot: 'bulb-samples', fromManifest: 'src.json', recordId: old.id, reason: 'unaffected by the change set' }];
  const m = Q.buildManifest({ ...base, records: [old], reuse });
  assert.equal(Q.qualify(m, [old], fx, { raws: { [old.id]: {} } }).backend.gates.G4.status, 'pass');
  const noReason = { ...m, reuse: [{ ...reuse[0], reason: undefined }] };
  assert.throws(() => Q.qualify(noReason, [old], fx, { raws: { [old.id]: {} } }), /reuse/);
  assert.throws(() => Q.qualify({ ...m, reuse: [{ ...reuse[0], fromManifest: undefined }] }, [old], fx, { raws: { [old.id]: {} } }), /reuse/);
  const root = await scratch();
  try {
    const r = await put(root, 's1', old, {});
    await mkdir(join(root, 'artifacts/project0/pfs'), { recursive: true });
    await writeFile(join(root, 'artifacts/project0/pfs/integrity-preflight.json'), JSON.stringify(preflightRecord(implementation, { pass: false })));
    const source = { ...base, campaign: 'webgpu-0', runDirs: ['s1'], trials: { 'G4/bulb-samples': { id: r.id, identity: r.identity } }, notRun: {}, reuse: [], attempts: {},
      preflight: { runDir: 'pfs', ...implementation }, bindings: await bind(root, 'pfs') };
    await writeFile(join(root, 'src.json'), JSON.stringify(source));
    await mkdir(join(root, 'artifacts/project0/pf'), { recursive: true });
    await writeFile(join(root, 'artifacts/project0/pf/integrity-preflight.json'), JSON.stringify(preflightRecord()));
    const final = { ...Q.buildManifest({ ...base, records: [r], reuse }), preflight: { runDir: 'pf', ...implementation }, bindings: await bind(root, 'pf') };
    await assert.rejects(Q.verifyPreflight(final, [r], { root }), /pfs/, 'the source campaign\'s failed preflight is found');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fix round 1, finding 8: the timing invocation is reused or rerun whole; a partial timing reuse is refused before any work', async () => {
  const { runCampaign } = await import('../campaign.mjs');
  const timing = [...WINDOW_PLANS.timing.map(w => w.name), 'G9/warmed'].map(k => { const [gate, ...slot] = k.split('/'); return pass(gate, slot.join('/')); });
  const entry = r => ({ gate: r.gate, slot: r.slot, fromManifest: 'src.json', recordId: r.id, reason: 'unaffected by the change set' });
  const partial = fakes(CORRECT);
  await assert.rejects(runCampaign({ name: 'webgpu-remediation', reuse: JSON.stringify([entry(timing[0])]) }, partial.d), /timing invocation/);
  assert.deepEqual(partial.calls, [], 'nothing runs, not even the preflight');
  assert.throws(() => Q.buildManifest({ ...base, records: [{ ...timing[0], campaign: 'webgpu-0' }], reuse: [entry(timing[0])] }), /timing invocation/, 'and on read/build');
  const source = { campaign: 'webgpu-0', trials: Object.fromEntries(timing.map(r => [`${r.gate}/${r.slot}`, { id: r.id }])) };
  const whole = fakes(CORRECT, { loadCampaign: async () => ({ manifest: source, records: timing, attempts: [] }) });
  await runCampaign({ name: 'webgpu-remediation', reuse: JSON.stringify(timing.map(entry)) }, whole.d);
  assert.deepEqual([...whole.recomputed[0]].sort(), timing.map(r => r.id).sort(), 'the whole reused invocation is verified together, so G9 finds its companions');
  assert.ok(!whole.calls.includes('session timing headed'), 'and the timing invocation is not rerun');
});

// --- Fix round 2 (Codex T10 r2) ---------------------------------------------------------------------------------------------------------------
test('fix round 2, finding 10: a checkpoint file that is listed but cannot be read, or reads as nothing, never reconciles', async () => {
  const log = cycleLog(-1), ok = checkpointsOf(log, () => 0), raw = { cycleLog: log, deadlineMisses: 0 };
  assert.ok(Q.checkpointProblems(raw, { ...ok, 7: undefined }, fx).length, 'a listed checkpoint whose payload is undefined');
  if (process.getuid?.() === 0) return;                                                    // root reads a mode-000 file; the unit case above still holds
  const root = await scratch();
  try {
    const files = Object.fromEntries(Object.entries(ok).map(([n, c]) => [`checkpoint-${n}.json`, c]));
    const g12 = await put(root, 'c', rec('G12', 'sequence', { identity: { ...identity, mode: 'headed' } }), raw, { sidecar: complete('G12'), files });
    const bindings = await bind(root, 'c');
    const { chmod } = await import('node:fs/promises');
    await chmod(join(root, 'artifacts/project0/c/checkpoint-7.json'), 0o000);              // listed by readdir, unreadable (EACCES)
    await assert.rejects(Q.recompute([g12], fx, { root, manifest: { requestedArgs: ARGS, bindings } }), /checkpoint-7\.json/);
    const res = await Q.recompute([g12], fx, { root, manifest: { requestedArgs: ARGS, bindings }, collect: true });
    assert.match(res.errors[g12.id] ?? '', /checkpoint-7\.json/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fix round 2, finding 11: a gate covered by a named attempt can never be notRun (build, load and qualify), timing attempts covering G6, G7 and G9', async () => {
  const inc = (gate, mode = 'headed') => rec(gate, 'incomplete', { identity: { ...identity, mode }, invalidations: ['session: browser hang: x', 'incomplete: the session produced no result'] });
  const g1 = inc('G1'), timing = inc('timing');
  assert.throws(() => Q.buildManifest({ ...base, records: [], attempts: [g1], notRun: { G1: { status: 'not run', reason: 'stopped' } } }), /attempt/);
  for (const g of ['G6', 'G7', 'G9']) assert.throws(() => Q.buildManifest({ ...base, records: [], attempts: [timing], notRun: { [g]: { status: 'not run', reason: 'stopped' } } }), /attempt/, g);
  // Codex's case: an incomplete G1, a measured G4 failure, and notRun.G1 blockedBy G4 edited in after build
  const failedG4 = g4({ metrics: { ...G4_PASS, logRRatio: 2 } });
  const m = Q.buildManifest({ ...base, records: [failedG4], attempts: [g1] });
  const edited = { ...m, notRun: { G1: { status: 'not run', reason: 'stopped', blockedBy: 'G4' } } };
  assert.throws(() => Q.qualify(edited, [failedG4], fx, { raws: { [failedG4.id]: {}, [g1.id]: {} }, attempts: [g1] }), /attempt/);
  const root = await scratch();
  try {
    const a = await put(root, 'r', g1, {});
    const file = { ...Q.buildManifest({ ...base, runDirs: ['r'], records: [], attempts: [a] }), notRun: { G1: { status: 'not run', reason: 'stopped' } } };
    await writeFile(join(root, 'm.json'), JSON.stringify(file));
    await assert.rejects(Q.loadCampaign('m.json', { root }), /attempt/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fix round 2, finding 12: every originating record that can support qualification must match its own campaign\'s preflight, including a mixed reused source', async () => {
  const root = await scratch();
  try {
    const other = { ...identity, implementationCommit: '1'.repeat(40) };
    const writePreflight = async dir => { await mkdir(join(root, 'artifacts/project0', dir), { recursive: true }); await writeFile(join(root, 'artifacts/project0', dir, 'integrity-preflight.json'), JSON.stringify(preflightRecord())); return bind(root, dir); };
    // own records: the first matches, a later one does not
    const a = g4(), b = pass('G5', 'qjulia-plane', 'headless', { identity: other });
    const own = { ...Q.buildManifest({ ...base, records: [a, b] }), preflight: { runDir: 'pf', ...implementation }, bindings: await writePreflight('pf') };
    await assert.rejects(Q.verifyPreflight(own, [a, b], { root }), /implementation/);
    // a mixed source campaign: A matches the source preflight, the reused B does not
    const A = await put(root, 's1', g4({ campaign: 'webgpu-0' }), {});
    const B = await put(root, 's1', pass('G5', 'qjulia-plane', 'headless', { campaign: 'webgpu-0', identity: other }), {});
    const source = { ...base, campaign: 'webgpu-0', runDirs: ['s1'], trials: { [`${A.gate}/${A.slot}`]: { id: A.id, identity: A.identity }, [`${B.gate}/${B.slot}`]: { id: B.id, identity: B.identity } },
      notRun: {}, reuse: [], attempts: {}, preflight: { runDir: 'pfs', ...implementation }, bindings: await writePreflight('pfs') };
    await writeFile(join(root, 'src.json'), JSON.stringify(source));
    const reuse = [{ gate: B.gate, slot: B.slot, fromManifest: 'src.json', recordId: B.id, reason: 'unaffected by the change set' }];
    const final = { ...Q.buildManifest({ ...base, records: [B], reuse }), preflight: { runDir: 'pf', ...implementation }, bindings: await writePreflight('pf') };
    await assert.rejects(Q.verifyPreflight(final, [B], { root }), /reused source src\.json.*implementation/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fix round 2, finding 13: collected verification errors make the campaign\'s exit status non-zero; a measured failure does not', async () => {
  const { runCampaign, exitStatus } = await import('../campaign.mjs');
  const g4id = CORRECT['G4 headed'][0].id;
  const rejected = fakes(CORRECT, { recompute: async records => ({ records, launches: [], raws: Object.fromEntries(records.map(r => [r.id, rawFor(r)])), errors: { [g4id]: 'artefact hash mismatch: x' } }) });
  const bad = await runCampaign({ name: 'webgpu-1' }, rejected.d);
  assert.equal(bad.failure, null);
  assert.ok(bad.verificationErrors.some(x => x.includes('artefact hash mismatch')));
  assert.ok(rejected.report.manifest.verificationErrors.length, 'and the report records them');
  assert.equal(exitStatus(bad), 1);
  const measured = fakes({ ...CORRECT, 'G4 headed': [pass('G4', 'bulb-samples', 'headed', { metrics: { ...G4_PASS, logRRatio: 2 } })] });
  const failedGate = await runCampaign({ name: 'webgpu-1' }, measured.d);
  assert.equal(failedGate.backend.gates.G4.status, 'fail');
  assert.equal(exitStatus(failedGate), 0, 'a measured hardware failure is a result, not a tooling error');
  const thrown = await runCampaign({ name: 'webgpu-1' }, fakes(CORRECT, { recompute: async () => { throw new Error('x'); } }).d);
  assert.equal(exitStatus(thrown), 1);
});

test('fix round 2, concern 3: a refusal may skip the report only before any qualification gate is attempted, and keeps the failed preflight\'s diagnostics', async () => {
  const { runCampaign } = await import('../campaign.mjs');
  // a failed preflight: refused, no gate, no report, and the refusal names the preserved preflight evidence
  const failing = fakes({}, { runPreflight: async () => ({ pass: false, record: preflightRecord(implementation, { pass: false }), runDir: '/x/20261020T000000000Z-dev-integrity-preflight-headed' }) });
  await assert.rejects(runCampaign({ name: 'webgpu-1' }, failing.d), /20261020T000000000Z-dev-integrity-preflight-headed/);
  assert.ok(!failing.calls.some(c => c.startsWith('session') || c === 'g2' || c.startsWith('report')), 'no gate and no report');
  // a reuse source that fails verification: refused before any gate, no report
  const src = fakes({}, { loadCampaign: async () => ({ manifest: { trials: {} }, records: [g4({ campaign: 'webgpu-0' })], attempts: [] }), verifyPreflight: async () => { throw new Error('source preflight missing'); } });
  await assert.rejects(runCampaign({ name: 'webgpu-remediation', reuse: JSON.stringify([{ gate: 'G4', slot: 'bulb-samples', fromManifest: 's.json', recordId: g4().id, reason: 'r' }]) }, src.d), /source preflight missing/);
  assert.ok(!src.calls.some(c => c.startsWith('session') || c === 'g2' || c.startsWith('report')));
  // once a gate has been attempted, a runner that throws still leaves a report, failing closed
  const late = fakes(CORRECT, { runSession: async o => { late.calls.push(`session ${o.gate} ${o.mode}`); if (o.gate === 'G4') throw new Error('runner crashed'); return { records: CORRECT[`${o.gate} ${o.mode}`] ?? [], runDir: `/x/${o.gate}-${o.mode}` }; } });
  const out = await runCampaign({ name: 'webgpu-1' }, late.d);
  assert.ok(late.calls.includes('report webgpu-1'), 'a report after an attempted gate');
  assert.match(out.stopped, /runner crashed/);
  assert.ok(!late.calls.includes('session G5 headed'), 'and nothing runs after it');
  assert.notEqual(out.backend.gates.G4.status, 'pass');
  assert.equal(out.decision.outcome, 'inconclusive');
});
