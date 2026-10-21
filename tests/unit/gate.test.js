import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { parseTapSummary, classifyUnit, classifyRed, validateEvidence, classifySuiteRun, overallGate } from '../../scripts/gate/lib.mjs';
import { runBounded, cleanUpGroup, probeGroup } from '../../scripts/gate/supervise.mjs';
import { runGate, GATE_PORT } from '../../scripts/plane-gate.mjs';
import { parseArgs, selectFiles } from '../../scripts/run-unit.mjs';
import { APPROVED_REFERENCE_IDENTITIES, REFERENCE_CHECKS } from '../../scripts/gate/reference-evidence.mjs';

const TAP_OK = '# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';

test('a unit run passes only with executed tests and no failure, skip or todo', () => {
  const ok = { exitCode: 0, signal: null, timedOut: false };
  assert.equal(classifyUnit(ok, parseTapSummary(TAP_OK)).state, 'passed');
  assert.deepEqual(classifyUnit(ok, parseTapSummary(TAP_OK.replace('# tests 3', '# tests 0').replace('# pass 3', '# pass 0'))), { state: 'failed', reason: 'no-tests' });
  assert.equal(classifyUnit(ok, parseTapSummary(TAP_OK.replace('# skipped 0', '# skipped 1'))).state, 'failed');
  assert.equal(classifyUnit({ ...ok, exitCode: 1 }, parseTapSummary(TAP_OK.replace('# fail 0', '# fail 1'))).state, 'failed');
  assert.deepEqual(classifyUnit(ok, null), { state: 'incomplete', reason: 'missing-evidence: no TAP summary' });
  assert.deepEqual(classifyUnit({ ...ok, timedOut: true }, parseTapSummary(TAP_OK)), { state: 'incomplete', reason: 'timeout' });
  assert.equal(parseTapSummary('# tests 3\n# pass 3\n'), null, 'a truncated summary is missing evidence');
});

test('RED is a named assertion failure; a missing module is only the bootstrap', () => {
  const failed = { exitCode: 1, signal: null, timedOut: false };
  const missing = "Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/w/src/shared/scene.js'";
  assert.match(classifyRed(failed, missing, { missing: 'src/shared/scene.js' }).reason, /^bootstrap only/);
  assert.equal(classifyRed(failed, missing, { missing: 'src/shared/history.js' }).confirmed, false);
  assert.equal(classifyRed({ ...failed, exitCode: 0 }, missing, { missing: 'src/shared/scene.js' }).confirmed, false);
  const assertion = "not ok 2 - undo restores the palette\n  ---\n  code: 'ERR_ASSERTION'\n  ...\nok 3 - other\n";
  assert.equal(classifyRed(failed, assertion, { failing: 'undo restores the palette' }).confirmed, true);
  const thrown = "not ok 2 - undo restores the palette\n  ---\n  error: 'boom'\n  code: 'ERR_TEST_FAILURE'\nok 3 - other\n  code: 'ERR_ASSERTION'\n";
  assert.match(classifyRed(failed, thrown, { failing: 'undo restores the palette' }).reason, /not on an assertion/, 'an assertion in another test does not count');
  assert.equal(classifyRed(failed, `${assertion}SyntaxError: Unexpected token`, { failing: 'undo restores the palette' }).confirmed, false);
  assert.equal(classifyRed(failed, `${assertion}LaunchDeniedError`, { failing: 'undo restores the palette' }).confirmed, false);
  assert.equal(classifyRed(failed, "not ok 2 - something else\n  code: 'ERR_ASSERTION'\n", { failing: 'undo restores the palette' }).confirmed, false);
  assert.equal(classifyRed({ ...failed, timedOut: true }, assertion, { failing: 'undo restores the palette' }).confirmed, false);
});

test('missing or empty suite evidence cannot pass', () => {
  const suite = { evidence: 'browser', report: 'r.json', requiredPasses: ['A', 'B'] };
  const ok = { exitCode: 0, signal: null, timedOut: false };
  assert.deepEqual(classifySuiteRun(ok, validateEvidence(suite, {})), { state: 'incomplete', reason: 'no report at r.json' });
  assert.equal(classifySuiteRun(ok, validateEvidence(suite, { report: [] })).state, 'failed');
  assert.equal(classifySuiteRun(ok, validateEvidence(suite, { report: [{ name: 'A' }] })).state, 'failed');
  assert.equal(classifySuiteRun(ok, validateEvidence(suite, { report: [{ name: 'A' }, { name: 'B' }, { name: 'FAIL' }] })).state, 'failed');
  assert.equal(classifySuiteRun(ok, validateEvidence(suite, { report: [{ name: 'A' }, { name: 'B' }] })).state, 'passed');
  assert.equal(validateEvidence({ evidence: 'browser', requiredPasses: [] }, { report: [{ name: 'A' }] }).ok, false, 'a suite without required passes is vacuous');
  const nav = { evidence: 'navigation' };
  const backend = name => ({ backend: name, frames: 12, renderedPerWheel: 1, burst: { commits: 1 } });
  assert.equal(validateEvidence(nav, { report: [backend('gpu'), backend('cpu')] }).ok, true);
  assert.equal(validateEvidence(nav, { report: [backend('gpu'), { ...backend('cpu'), frames: 0 }] }).ok, false);
  assert.equal(validateEvidence(nav, { report: [backend('gpu')] }).ok, false);
  const graphics = { evidence: 'graphics', benchmark: true };
  const entry = { samples: [1, 2, 3, 4, 5, 6], benchmarks: [1, 2, 3, 4] };
  assert.equal(validateEvidence(graphics, { report: [entry] }).ok, true);
  assert.equal(validateEvidence(graphics, { report: [{ ...entry, benchmarks: [1] }] }).ok, false);
  assert.equal(validateEvidence({ evidence: 'build', requiredFiles: ['dist/index.html'] }, { files: { 'dist/index.html': false } }).kind, 'missing');
});

test('the overall gate is passed, pending only for deferrals, otherwise failed', () => {
  const ids = ['unit', 'gpu'];
  assert.equal(overallGate({ unit: { state: 'passed' }, gpu: { state: 'passed' } }, ids).exitCode, 0);
  assert.equal(overallGate({ unit: { state: 'passed' }, gpu: { state: 'deferred' } }, ids).exitCode, 2);
  assert.equal(overallGate({ unit: { state: 'failed' }, gpu: { state: 'deferred' } }, ids).exitCode, 1, 'a failure is not hidden by a deferral');
  assert.equal(overallGate({ unit: { state: 'passed' } }, ids).state, 'failed', 'a suite that never ran is not-run, which fails');
  assert.equal(overallGate({ unit: { state: 'passed' }, gpu: { state: 'skipped' } }, ids).state, 'failed', 'an unclassified state fails closed');
});

function fakeChild({ stdout = '', exitCode = 0, hang = false, ready = false, deaf = false } = {}) {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), signals: [] });
  child.kill = signal => { child.signals.push(signal); if (!deaf) setImmediate(() => child.emit('close', null, signal)); };
  setImmediate(() => {
    if (stdout) child.stdout.emit('data', stdout);
    if (ready) return;
    if (!hang) child.emit('close', exitCode, null);
  });
  return child;
}

// A fake process group: `members` maps member names to { dieOn } ('SIGTERM', 'SIGKILL' or null).
// The leader is a member too, until its close event. `probeError` makes signal 0 fail otherwise.
function fakeGroup(members = {}, { probeError = null } = {}) {
  const signals = [];
  const groupSignal = (pgid, name) => {
    if (name === 0) {
      if (probeError) throw Object.assign(new Error(probeError), { code: probeError });
      if (!Object.keys(members).length) throw Object.assign(new Error('no such group'), { code: 'ESRCH' });
      return;
    }
    signals.push(name);
    for (const [member, entry] of Object.entries(members)) if (entry.dieOn === name || (name === 'SIGKILL' && entry.dieOn === 'SIGTERM')) { delete members[member]; entry.onExit?.(); }
  };
  return { signals, groupSignal, members };
}
// A child whose process group holds itself plus `others`.
function groupedChild(childOptions = {}, others = {}, groupOptions = {}) {
  const child = Object.assign(fakeChild({ ...childOptions, deaf: true }), { pid: 4242 });
  const group = fakeGroup({ ...others, leader: { dieOn: childOptions.deaf ? null : 'SIGTERM', onExit: () => child.emit('close', null, 'SIGTERM') } }, groupOptions);
  child.once('close', () => { delete group.members.leader; });
  return { child, group };
}
const run = ({ child, group }, timeoutMs = 1000) => runBounded({ spawnFn: () => child, groupSignal: group.groupSignal, command: 'x', timeoutMs, cleanupMs: 20 });

test('runBounded classifies a hung child as timed out and kills its group', async () => {
  const subject = groupedChild({ hang: true });
  const result = await run(subject, 20);
  assert.deepEqual([result.timedOut, result.cleanup], [true, 'confirmed']);
  assert.deepEqual(subject.group.signals, ['SIGTERM']);
  await assert.rejects(async () => runBounded({ command: 'x', timeoutMs: 5 }), /requires spawnFn/);
});

test('a child that ignores termination and never closes still yields a classified result in time', async () => {
  const subject = groupedChild({ hang: true, deaf: true });
  const started = Date.now();
  const result = await run(subject, 20);
  assert.deepEqual([result.timedOut, result.cleanup], [true, 'unconfirmed']);
  assert.deepEqual(subject.group.signals, ['SIGTERM', 'SIGKILL']);
  assert.ok(Date.now() - started < 20 + 2 * 20 + 400, 'within the execution deadline plus two cleanup phases');
  assert.equal(classifySuiteRun(result, { ok: true }).state, 'incomplete');
});

test('a group member that outlives the leader is killed before the result, and confirmed', async () => {
  const subject = groupedChild({}, { helper: { dieOn: 'SIGKILL' } });
  const result = await run(subject);
  assert.deepEqual([result.exitCode, result.timedOut, result.cleanup], [0, false, 'confirmed']);
  assert.deepEqual(subject.group.signals, ['SIGTERM', 'SIGKILL'], 'the leader\'s exit did not cancel cleanup');
  assert.equal(classifySuiteRun(result, { ok: true }).state, 'passed');
});

test('a group member that never exits, or an unreadable group, fails closed', async () => {
  const stuck = await run(groupedChild({}, { helper: { dieOn: null } }));
  assert.deepEqual([stuck.exitCode, stuck.cleanup], [0, 'unconfirmed']);
  assert.equal(classifySuiteRun(stuck, { ok: true }).state, 'incomplete');
  assert.equal((await run(groupedChild({}, {}, { probeError: 'EPERM' }))).cleanup, 'unconfirmed');
  assert.equal(probeGroup(() => { throw Object.assign(new Error('x'), { code: 'EPERM' }); }, 1), 'unknown');
  assert.equal(await cleanUpGroup({ groupSignal: () => {}, pgid: undefined, leader: { closed: () => false }, cleanupMs: 5 }), 'unconfirmed', 'no group id cannot be confirmed');
});

test('unconfirmed cleanup fails unit and RED classification too', () => {
  const passing = { exitCode: 0, signal: null, timedOut: false, cleanup: 'unconfirmed' };
  assert.equal(classifyUnit(passing, parseTapSummary(TAP_OK)).state, 'incomplete');
  const red = { exitCode: 1, signal: null, timedOut: false, cleanup: 'unconfirmed' };
  assert.equal(classifyRed(red, "not ok 2 - t\n  code: 'ERR_ASSERTION'\n", { failing: 't' }).confirmed, false);
});

function gateDeps({ env = { ATLAS_GPU_HANDOFF: 'test' }, porcelain = '', portInUse = false, reports = {}, scripts = {} } = {}) {
  const spawned = [], removed = [], children = new Map();
  const spawnFn = (command, args) => {
    const key = args.join(' ');
    spawned.push(key);
    const child = key.startsWith('scripts/serve.mjs') ? fakeChild({ stdout: `ATLAS is ready at http://localhost:${GATE_PORT}`, ready: true })
      : key === 'scripts/run-unit.mjs' ? fakeChild(scripts.unit ?? { stdout: 'UNIT {"state":"passed","reason":"3 tests passed"}\n' })
      : fakeChild(scripts[key] ?? {});
    child.pid = 1000 + spawned.length;
    child.once('close', () => { child.closed = true; });
    children.set(child.pid, child);
    return child;
  };
  // Each child's group holds only the child: empty once it has closed; signals reach the child.
  const groupSignal = (pgid, name) => {
    const child = children.get(pgid);
    if (!child || child.closed) throw Object.assign(new Error('no such group'), { code: 'ESRCH' });
    if (name !== 0) child.kill(name);
  };
  const manifest = {
    build: { requiredFiles: ['dist/index.html'] },
    suites: [
      { id: 'browser', gpu: false, command: ['tests/browser.mjs'], report: 'b.json', evidence: 'browser', requiredPasses: ['A'] },
      { id: 'graphics', gpu: true, command: ['tests/graphics.mjs'], report: 'g.json', evidence: 'graphics' },
    ],
  };
  const files = { 'tests/suites.manifest.json': manifest, 'b.json': [{ name: 'A' }], 'g.json': [{ samples: [1, 2, 3, 4, 5, 6] }], ...reports };
  return {
    spawned, removed,
    deps: {
      root: '/candidate', env, spawnFn, groupSignal, now: () => '2026-10-20T00:00:00.000Z',
      git: { head: async () => 'abc123', porcelain: async () => porcelain },
      fs: { readJson: async rel => files[rel], exists: async () => true, remove: async rel => { removed.push(rel); } },
      probePort: async () => portInUse,
    },
  };
}

test('a clean candidate with the GPU handed over passes every suite', async () => {
  const { deps, spawned } = gateDeps();
  const record = await runGate(deps);
  assert.equal(record.overall.state, 'passed');
  assert.deepEqual(Object.keys(record.results), ['unit', 'build', 'browser', 'graphics', 'cleanup']);
  assert.deepEqual(record.requiredIds, ['unit', 'build', 'browser', 'graphics', 'cleanup']);
  assert.equal(record.server, 'confirmed', 'the server\'s whole group exited');
  assert.ok(spawned.includes(`scripts/serve.mjs --port ${GATE_PORT}`));
  assert.equal(record.commit, 'abc123');
});

test('a suite that passes but cannot confirm cleanup is incomplete and stops later suites', async () => {
  const { deps, spawned } = gateDeps({ scripts: { 'tests/browser.mjs': { exitCode: 125 } } });
  const record = await runGate(deps);
  assert.match(record.results.browser.reason, /cleanup-unconfirmed/);
  assert.equal(record.results.graphics.state, 'not-run');
  assert.equal(record.results.cleanup.state, 'incomplete');
  assert.equal(record.overall.state, 'failed');
  assert.ok(!spawned.includes('tests/graphics.mjs'), 'no GPU work after an unconfirmed cleanup');
});

test('a printed cleanup failure is honoured whatever the exit code, and stops the GPU suite', async () => {
  const { deps, spawned } = gateDeps({ scripts: { 'tests/browser.mjs': { stdout: 'CLEANUP-UNCONFIRMED browser: close timed out\n', exitCode: 124 } } });
  const record = await runGate(deps);
  assert.match(record.results.browser.reason, /cleanup-unconfirmed/);
  assert.equal(record.results.graphics.state, 'not-run');
  assert.equal(record.overall.state, 'failed');
  assert.ok(!spawned.includes('tests/graphics.mjs'), 'the following GPU suite never launches');
});

test('a GPU deferral leaves the gate pending, never passed', async () => {
  const { deps, spawned } = gateDeps({ env: { ATLAS_GPU_DEFERRED: 'Project 0 holds the GPU' } });
  const record = await runGate(deps);
  assert.equal(record.results.graphics.state, 'deferred');
  assert.equal(record.results.browser.state, 'passed');
  assert.equal(record.overall.state, 'pending');
  assert.ok(!spawned.includes('tests/graphics.mjs'));
});

test('the gate refuses to run without an explicit GPU statement, or on a dirty tree', async () => {
  for (const env of [{}, { ATLAS_GPU_HANDOFF: 'a', ATLAS_GPU_DEFERRED: 'b' }]) {
    const { deps, spawned } = gateDeps({ env });
    const record = await runGate(deps);
    assert.equal(record.overall.state, 'failed');
    assert.deepEqual(spawned, []);
  }
  const dirty = gateDeps({ porcelain: ' M src/app.js' });
  assert.equal((await runGate(dirty.deps)).overall.state, 'failed');
  assert.deepEqual(dirty.spawned, []);
});

test('a failed unit run stops the gate before any browser starts', async () => {
  const { deps, spawned } = gateDeps({ scripts: { unit: { stdout: 'UNIT {"state":"failed","reason":"failures: 1"}\n', exitCode: 1 } } });
  const record = await runGate(deps);
  assert.equal(record.results.unit.state, 'failed');
  assert.equal(record.overall.state, 'failed');
  assert.deepEqual(spawned, ['scripts/run-unit.mjs']);
});

test('an occupied port is never adopted', async () => {
  const { deps, spawned } = gateDeps({ portInUse: true });
  const record = await runGate(deps);
  assert.match(record.results.browser.reason, /in use/);
  assert.equal(record.overall.state, 'failed');
  assert.ok(!spawned.some(key => key.startsWith('scripts/serve.mjs')));
});

test('a suite without its report is incomplete, and the gate fails', async () => {
  const { deps } = gateDeps({ reports: { 'b.json': undefined } });
  const record = await runGate(deps);
  assert.equal(record.results.browser.state, 'incomplete');
  assert.equal(record.overall.state, 'failed');
});

test('the unit runner only runs manifest files and parses RED expectations', () => {
  assert.deepEqual(parseArgs(['tests/unit/a.test.js', '--expect-fail', 'name']), { files: ['tests/unit/a.test.js'], expectation: { failing: 'name' } });
  assert.throws(() => parseArgs(['--expect-missing']), /needs a module path/);
  assert.deepEqual(selectFiles({ files: ['a', 'b'] }, []), ['a', 'b']);
  assert.throws(() => selectFiles({ files: ['a'] }, ['c']), /not in tests\/unit.manifest.json/);
  assert.throws(() => selectFiles({ files: [] }, []), /lists no files/);
});

// Fix round 1 (Codex run 20261020T184044Z-f4e5).
test('a leader that exits while a descendant holds its output is not a timeout', async () => {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), pid: 4343, kill() {} });
  const group = fakeGroup({ helper: { dieOn: 'SIGTERM', onExit: () => setImmediate(() => child.emit('close', 0, null)) } });
  setImmediate(() => child.emit('exit', 0, null));
  const result = await run({ child, group }, 1000);
  assert.deepEqual([result.exitCode, result.timedOut, result.cleanup], [0, false, 'confirmed']);
  assert.deepEqual(group.signals, ['SIGTERM'], 'cleanup began at the leader\'s exit, not at the deadline');
});

test('a unit runner that cannot confirm its own cleanup fails the cleanup result too', async () => {
  const stdout = 'UNIT {"state":"incomplete","reason":"cleanup-unconfirmed: an owned process did not exit","cleanup":"unconfirmed"}\n';
  const { deps, spawned } = gateDeps({ scripts: { unit: { stdout, exitCode: 1 } } });
  const record = await runGate(deps);
  assert.equal(record.results.unit.state, 'incomplete');
  assert.match(record.results.unit.reason, /cleanup-unconfirmed/);
  assert.equal(record.results.cleanup.state, 'incomplete');
  assert.equal(record.overall.state, 'failed');
  assert.deepEqual(spawned, ['scripts/run-unit.mjs']);
});

test('an infrastructure failure still yields a failed record, at the start or at the final identity check', async () => {
  const settle = promise => promise.catch(error => ({ rejected: error.message }));
  const early = gateDeps();
  early.deps.git.head = async () => { throw new Error('git rev-parse timed out'); };
  const first = await settle(runGate(early.deps));
  assert.equal(first.rejected, undefined, 'runGate never rejects');
  assert.equal(first.overall.state, 'failed');
  assert.equal(first.results.unit.state, 'incomplete');
  assert.match(first.results.unit.reason, /git rev-parse timed out/);
  assert.deepEqual(early.spawned, []);
  const late = gateDeps();
  let calls = 0;
  late.deps.git.porcelain = async () => { if (++calls > 1) throw new Error('git status timed out'); return ''; };
  const second = await settle(runGate(late.deps));
  assert.equal(second.rejected, undefined, 'runGate never rejects');
  assert.equal(second.overall.state, 'failed', 'a note alone never lets a gate pass');
  assert.match(second.results.unit.reason, /git status timed out/);
  assert.equal(second.server, 'confirmed', 'the owned server was still stopped');
});

test('an unsuccessful suite keeps the tail of its output in the record', async () => {
  const stdout = `${'x'.repeat(20000)}AssertionError: the palette did not change\n`;
  const { deps } = gateDeps({ scripts: { 'tests/browser.mjs': { stdout, exitCode: 1 } } });
  const record = await runGate(deps);
  assert.equal(record.results.browser.state, 'failed');
  assert.match(record.results.browser.stdoutTail ?? '', /the palette did not change/);
  assert.ok(record.results.browser.stdoutTail.length <= 16384, 'the tail is bounded');
  assert.equal(typeof record.results.browser.stderrTail, 'string');
  assert.equal(record.results.graphics.state, 'passed');
  assert.equal(record.results.graphics.stdoutTail, undefined, 'a passing suite carries no tail');
});

test('CPU suites run without a server or port probe even when the GPU is deferred', async () => {
  const subject = gateDeps({ env: { ATLAS_GPU_DEFERRED: 'held elsewhere' }, portInUse: true });
  const readJson = subject.deps.fs.readJson;
  subject.deps.fs.readJson = async path => path === 'tests/suites.manifest.json' ? {
    build: { requiredFiles: ['dist/index.html'] },
    suites: [{ id: 'cpu', gpu: false, server: false, timeoutMs: 600000, command: ['tests/cpu.mjs'], report: 'cpu.json', evidence: 'workflow', requiredPasses: ['A'] }],
  } : path === 'cpu.json' ? [{ name: 'A' }] : readJson(path);
  subject.deps.probePort = async () => { assert.fail('CPU suite must not probe a server port'); };
  const record = await runGate(subject.deps);
  assert.equal(record.results.cpu.state, 'passed');
  assert.equal(record.overall.state, 'passed');
  assert.deepEqual(subject.spawned, ['scripts/run-unit.mjs', 'scripts/build.mjs', 'tests/cpu.mjs']);
  assert.ok(subject.removed.includes('cpu.json'), 'stale evidence is removed before execution');
});

test('a failed CPU suite prevents browser work and cannot pass on a stale report', async () => {
  const subject = gateDeps({ scripts: { 'tests/cpu.mjs': { exitCode: 124 } } });
  const readJson = subject.deps.fs.readJson;
  subject.deps.fs.readJson = async path => {
    if (path === 'tests/suites.manifest.json') {
      const manifest = await readJson(path);
      return { ...manifest, suites: [{ id: 'cpu', gpu: false, server: false, timeoutMs: 600000, command: ['tests/cpu.mjs'], report: 'cpu.json', evidence: 'workflow', requiredPasses: ['A'] }, ...manifest.suites] };
    }
    return path === 'cpu.json' ? [{ name: 'A' }] : readJson(path);
  };
  const record = await runGate(subject.deps);
  assert.equal(record.results.cpu.state, 'incomplete');
  assert.equal(record.overall.state, 'failed');
  assert.ok(!subject.spawned.some(command => command.startsWith('scripts/serve.mjs')));
  assert.equal(record.results.browser, undefined);
});

test('the gate retains reference counts and artifact identities for the commit audit', async () => {
  const identities = { ...APPROVED_REFERENCE_IDENTITIES };
  const report = Object.entries(REFERENCE_CHECKS).map(([name, checked]) => ({ name, state: 'passed', checked, identities, durationMs: 1 }));
  const subject = gateDeps();
  subject.deps.fs.readJson = async path => path === 'tests/suites.manifest.json' ? {
    build: { requiredFiles: ['dist/index.html'] },
    suites: [{ id: 'reference', gpu: false, server: false, timeoutMs: 600000, command: ['tests/reference.mjs'], report: 'reference.json', evidence: 'reference', requiredPasses: Object.keys(REFERENCE_CHECKS) }],
  } : report;
  const record = await runGate(subject.deps);
  assert.equal(record.results.reference.state, 'passed');
  assert.deepEqual(record.results.reference.evidence, report);
  assert.ok(record.requiredIds.includes('reference'));
});
