import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { cleanupState, installSuiteDeadline } from '../support/bounded.mjs';
import { compareLadder, ladderMetrics, runLadderSession, stopLadderMonitor, persistLadderEvidence, runLadderCell, ladderCells } from '../support/space-performance-ladder.mjs';
import { compareLadderDirectory } from '../space-performance-ladder.mjs';
import { pacedCameraWindow } from '../support/ladder-control.mjs';
import { summarizeGpuClocks, epochClockWindows } from '../support/gpu-clock-evidence.mjs';
import { expectBackend, drainExpecting } from '../support/space-lifecycle-checks.mjs';

const manifest = JSON.parse(await readFile('tests/reference/performance-ladder-v1.json'));

test('B15-R16-F4 every paced cell derives a finite interaction clock window from its last request', async () => {
  const workload = JSON.parse(await readFile(manifest.workload));
  assert.equal(workload.workloads.interaction.durationMs, undefined);
  for (const cell of ladderCells(manifest).filter(c => c.mode === 'paced')) {
    const phase = workload.workloads.interaction, poses = phase.cameraPoses[cell.scene];
    const window = pacedCameraWindow(1000, phase, poses);
    assert.equal(window.end, 1000 + poses.at(-1).requestTimeMs, JSON.stringify(cell));
    assert.ok(Number.isFinite(JSON.parse(JSON.stringify(window)).end));
    const origin = Date.UTC(2026, 9, 22);
    const raw = Array.from({ length: 1 + (window.end - window.start) / 100 }, (_, i) =>
      `${new Date(origin + window.start + i * 100).toISOString().replace('T', ' ').replace('Z', '').replaceAll('-', '/')}, GPU-test, 210, P8, 29.5`).join('\n');
    const clocks = summarizeGpuClocks({ raw }, epochClockWindows(origin, { interaction: window }));
    assert.equal(clocks.phases.interaction.state, 'measured', JSON.stringify(cell));
    assert.equal(clocks.latency.state, 'measured');
  }
});

test('B15-R16-F5 isolated blank ladder page drains without relaxing real-page hardware checks', async () => {
  let url = 'http://localhost/', acceleration = 'hardware', status = 'complete';
  const page = { url: () => url, evaluate: async fn => {
    if (fn.name === 'drainWebGL') return { status };
    if (String(fn).includes('acceleration')) return { acceleration, contextLost: false };
  } };
  expectBackend(page, 'webgl');
  assert.equal((await drainExpecting(page)).status, 'complete');
  url = 'about:blank'; acceleration = null; status = 'no-webgl';
  await assert.doesNotReject(drainExpecting(page));
  url = 'http://localhost/';
  await assert.rejects(drainExpecting(page), /hardware WebGL/);
  acceleration = 'software'; status = 'complete';
  await assert.rejects(drainExpecting(page), /hardware WebGL/);
});

const clock = {protocol:'atlas.gpu-clocks-v1',state:'measured',medianMHz:210,band:'lt270',bandShare:1,sampleCount:11,uuid:'GPU-test'};
const evidence = () => manifest.order.flatMap((rung, position) => ['paced', 'unpaced'].map(mode => ({
  schema: 'atlas.performance-ladder-evidence', schemaVersion: 3, sessionId: 'session-a', attemptId: `${position}-${mode}`,
  cell: { rung, position, mode }, classification: { state: 'measured', acceptance: false },
  cleanup: { state: 'confirmed' }, tasks: [], timings: [],
  clockEvidence: {...clock,latency:clock,phases:{orbit:clock}},
  metrics: { latencyP95Ms: 10, benchmarkDraftsPerSecond: 100, confirmedDraftsPerSecond: 100, failures: [] },
})));

test('B15-R14-F1 unconfirmed cleanup stops the ladder with sticky exit 125 and preserves the attempted summary', async () => {
  for (const error of [Object.assign(Error('monitor still alive'), { cleanup: 'unconfirmed' }), Error('CLEANUP-UNCONFIRMED driver destroy'), Error('unknown isolation')]) {
    const attempted = [], report = [], exits = [], cells = [{ rung: 'L0' }, { rung: 'L1' }];
    cleanupState.unconfirmed = false;
    try {
      await assert.rejects(runLadderSession({ cells, report, exit: code => exits.push(code), runCell: async cell => { attempted.push(cell); throw error; } }));
      assert.equal(attempted.length, 1, 'no next cell after unconfirmed isolation');
      assert.deepEqual(exits, [125]); assert.equal(cleanupState.unconfirmed, true);
      assert.equal(report.at(-1).attempted, 1); assert.equal(report.at(-1).failed.length, 1);
      assert.equal(report.at(-1).skipped, 1);
      const deadline = installSuiteDeadline('injected-ladder', 1, { exit: code => exits.push(code) });
      await new Promise(resolve => setTimeout(resolve, 10)); clearTimeout(deadline);
      assert.deepEqual(exits, [125, 125], 'later deadline cannot downgrade cleanup failure');
    } finally { cleanupState.unconfirmed = false; }
  }
});

test('B15-R14-F1 monitor escalation awaits confirmed termination and reports an unconfirmed kill', async () => {
  for (const confirmed of [true, false]) {
    const signals = [], waits = [];
    const result = await stopLadderMonitor({ monitor: { kill: signal => signals.push(signal) }, stopped: Promise.resolve(), isDone: () => false,
      wait: async (_, ms, label) => { waits.push({ ms, label }); if (waits.length === 1 || !confirmed) throw Error('still alive'); } });
    assert.equal(result.state, confirmed ? 'confirmed' : 'unconfirmed');
    assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']); assert.equal(waits.length, 2);
    assert.ok(waits.every(w => w.ms > 0 && w.ms <= 5000));
    assert.match(result.escalation, /still alive/);
  }
});

test('B15-R14-F2 comparison latency combines orbit and interaction drafts and excludes settled work', () => {
  const events = [];
  for (const [requestId, phase, requestedAt, latency, settled] of [
    ['o', 'orbit', 10, 10, false], ['i', 'interaction', 110, 200, false],
    ['s', 'interaction', 120, 900, true], ['x', 'stress', 130, 800, true],
  ]) { const identity = { requestId }; events.push({ type: 'request', identity, phase, requestedAt, settled }, { type: 'presenter-completion', identity, queueCompletedAt: requestedAt + latency }); }
  const result = ladderMetrics(events, 2000, { orbit: { start: 0, end: 100 }, interaction: { start: 100, end: 400 }, stress: { start: 400, end: 2000 } });
  assert.equal(result.latencyP95Ms, 200);
  assert.equal(result.phases.orbit.latencyP95Ms, 10); assert.equal(result.phases.interaction.latencyP95Ms, 200);
  assert.equal(result.phases.stress.latencyP95Ms, null);
  assert.equal(result.phases.interaction.settledLatencyP95Ms, 900); assert.equal(result.phases.stress.settledLatencyP95Ms, 800);
});

test('B15-R14-F3 comparison rejects legacy identities schema classifications and recorded failures', () => {
  assert.equal(compareLadder(evidence(), manifest).state, 'measured');
  for (const change of [
    rows => rows.forEach(r => delete r.sessionId), rows => { rows[0].sessionId = ''; }, rows => { rows[0].sessionId = ' '; },
    rows => { rows[0].sessionId = 'another'; }, rows => { rows[0].schemaVersion = 2; }, rows => { delete rows[0].schema; },
    rows => { delete rows[0].classification; }, rows => { rows[0].classification.state = 'inconclusive'; },
    rows => { rows[0].error = 'assertion after measurement'; }, rows => { rows[0].cleanupFailure = 'unconfirmed'; },
    rows => { rows[0].cleanup.state = 'unconfirmed'; }, rows => { rows[0].metrics.failures.push('failure'); },
    rows => { rows[0].tasks.push({ error: 'task failed' }); }, rows => { rows[0].timings.push({ invalidated: true }); },
    rows => { rows[0].clockErrors = ['clock collection failed']; }, rows => { rows[0].error = ''; },
  ]) { const rows = evidence(); change(rows); assert.equal(compareLadder(rows, manifest).state, 'incomplete', String(change)); }
});

test('B15-R14-F4 repeated cells receive immutable distinct attempt evidence and explicit comparison dispositions', async () => {
  const root = await mkdtemp('/mnt/ml_storage/scratch/b15-r15-evidence-');
  try {
    const report = [], paths = [], attempts = [], cell = { instrumentation: 'plain', scene: 'bulb', repetition: 1, mode: 'paced', position: 0, rung: 'L0' };
    await runLadderSession({ cells: [cell, cell, cell], report, runCell: async (selected, attemptId) => {
      attempts.push(attemptId); paths.push(await persistLadderEvidence(root, { ...evidence()[0], cell: selected, attemptId }));
    } });
    assert.equal(new Set(attempts).size, 3); assert.ok(attempts.every(id => typeof id === 'string' && id.length));
    assert.equal(new Set(paths).size, 3); assert.equal((await readdir(root)).length, 3);
    assert.deepEqual(await Promise.all(paths.map(async path => JSON.parse(await readFile(path)).attemptId)), attempts);
    await assert.rejects(persistLadderEvidence(root, { ...evidence()[0], cell, attemptId: attempts[0] }), /EEXIST/);
    const rows = evidence(), duplicate = { ...structuredClone(rows[0]), attemptId: 'retry' }; rows.push(duplicate);
    const pending = compareLadder(rows, manifest);
    assert.equal(pending.state, 'incomplete'); assert.equal(pending.attempts.filter(a => a.disposition === 'needs-disposition').length, 2);
    const dispositions = { [rows[0].attemptId]: { state: 'excluded', reason: 'peer reviewed repeat' }, retry: { state: 'selected', reason: 'peer selected repeat' } };
    const compared = compareLadder(rows, manifest, { attemptDispositions: dispositions });
    assert.equal(compared.state, 'measured'); assert.equal(compared.attempts.find(a => a.attemptId === rows[0].attemptId).disposition, 'excluded');
    rows[0].error = 'failed earlier attempt';
    assert.equal(compareLadder(rows, manifest, { attemptDispositions: dispositions }).state, 'incomplete', 'a disposition cannot hide a failed attempt');
    delete rows[0].error;
    delete dispositions.retry; assert.equal(compareLadder(rows, manifest, { attemptDispositions: dispositions }).state, 'incomplete');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('B15-O3 phase lateness reports distributions and counts strictly above the frozen 4 ms bound', () => {
  const windows = { orbit: { start: 0, end: 100 }, interaction: { start: 100, end: 200 }, stress: { start: 200, end: 300 } };
  const metrics = ladderMetrics([], 300, windows, [{ phase: 'orbit', lateByMs: [0, 4, 4.1, 40] }, { phase: 'interaction', lateByMs: [1, 2] }, { phase: 'stress', lateByMs: [5] }]);
  assert.deepEqual(metrics.phases.orbit.lateness, { count: 4, thresholdMs: 4, above4Ms: 2, minMs: 0, p50Ms: 4, p95Ms: 40, p99Ms: 40, maxMs: 40 });
  assert.equal(metrics.phases.interaction.lateness.above4Ms, 0); assert.equal(metrics.phases.stress.lateness.above4Ms, 1);
});

test('B15-R14-F1 cell persists cleanup evidence before terminal exit and ordinary confirmed failures can continue', async () => {
  const root = await mkdtemp('/mnt/ml_storage/scratch/b15-r15-cleanup-');
  const cell = ladderCells(manifest)[0];
  try {
    for (const kind of ['monitor', 'driver', 'probe', 'page', 'assertion', 'escalated', 'sampling']) {
      const report = [], exits = [], calls = [];
      let waits = 0;
      const monitor = new EventEmitter(); monitor.stdout = new EventEmitter(); monitor.stderr = new EventEmitter();
      monitor.kill = () => true;
      const measurement = { timeOriginMs:Date.UTC(2026,9,22),driverCleanup: { state: 'confirmed' }, events: [], tasks: [], timings: [], issued: [], durationMs: 1000,
        windows: { orbit: { start: 0, end: 1000 } }, allocation: kind==='assertion'?2**31:0 };
      const identity = { requestId: 'draft' };
      measurement.events.push({ type: 'request', identity, phase: 'orbit', requestedAt: 0 }, { type: 'presenter-completion', identity, queueCompletedAt: 10 }, { type: 'benchmark-completion', identity, at: 10 });
      const page = { goto: async url => { if (kind === 'page' && url === 'about:blank') throw Error('page teardown failed'); }, waitForFunction: async () => {}, evaluate: async fn => {
        if (fn.name === 'runInPage') {
          if (kind === 'driver') throw Error('CLEANUP-UNCONFIRMED driver destroy');
          monitor.stdout.emit('data',kind==='sampling'?'N/A\n':Array.from({length:11},(_,i)=>`${new Date(measurement.timeOriginMs+i*100).toISOString().replace('T',' ').replace('Z','').replaceAll('-','/')}, GPU-test, 210, P8, 29.5\n`).join(''));
          return measurement;
        }
        if (String(fn).includes('__ladderPartial')) return { driverCleanup: { state: 'unconfirmed', error: 'driver destroy failed' }, events: measurement.events };
        if (String(fn).includes('environmentProbe')) {
          if (kind === 'probe') throw Error('probe cleanup failed');
          return { visibilityState: 'visible', hidden: false, idleFenceRttP95: .1, idleScopeRttP95: .1 };
        }
      } };
      const pending = runLadderSession({ cells: [cell, cell], report, exit: code => {
        exits.push(code); assert.equal(report.filter(r => r.path).length, 1, 'evidence is persisted before exit');
      }, runCell: async (selected, attemptId) => {
        calls.push(attemptId);
        return runLadderCell({ page, cell: selected, attemptId, root, report, sessionId: kind, pass: () => {}, url: 'inert',
          environment: { chromeGpu: { vendorId: 0x10de }, webgpuStatus: 'Hardware accelerated' }, spawnMonitor: () => monitor, drainPage: async () => {},
          monitorWait: async () => { waits++; if (kind === 'monitor' || kind === 'escalated' && waits % 2 === 1) throw Error('monitor still alive'); return { signal: 'SIGKILL' }; } });
      } });
      if (['escalated','sampling'].includes(kind)) await pending; else await assert.rejects(pending);
      const fatal = ['monitor', 'driver', 'probe', 'page'].includes(kind);
      assert.equal(calls.length, fatal ? 1 : 2); assert.deepEqual(exits, fatal ? [125] : []);
      const records = await Promise.all(report.filter(r => r.path).map(async r => JSON.parse(await readFile(r.path))));
      for (const record of records) {
        assert.equal(record.cleanup.state, fatal ? 'unconfirmed' : 'confirmed');
        if (fatal) { assert.match(record.error, /CLEANUP-UNCONFIRMED/); assert.ok(record.cleanupFailure); }
        if (kind === 'page') assert.match(record.cleanup.page.error, /page teardown failed/);
        if (kind === 'probe') assert.match(record.originalError, /probe cleanup failed/);
        if (kind === 'driver') assert.match(record.originalError, /driver destroy/);
        if (kind === 'assertion') { assert.match(record.error, /allocation cap/); assert.equal(record.classification.state, 'failed-harness'); }
        if (kind === 'escalated') { assert.equal(record.classification.state, 'measured'); assert.match(record.cleanup.monitor.escalation, /still alive/); }
        if (kind === 'sampling') { assert.equal(record.classification.state, 'inconclusive'); assert.equal(record.classification.clockSampling,'unavailable'); assert.equal(record.clockEvidence.state,'unavailable'); }
      }
      cleanupState.unconfirmed = false;
    }
  } finally { cleanupState.unconfirmed = false; await rm(root, { recursive: true, force: true }); }
});

test('B15-R14-F3 F4 comparison directory includes immutable attempts and explicitly rejects legacy collections', async () => {
  const root = await mkdtemp('/mnt/ml_storage/scratch/b15-r15-compare-');
  try {
    const manifestSha256 = createHash('sha256').update(await readFile('tests/reference/performance-ladder-v1.json')).digest('hex');
    const rows = evidence().map(r => ({ ...r, manifestSha256, cell: { instrumentation: 'plain', scene: 'bulb', repetition: 1, ...r.cell } }));
    for (const row of rows) await persistLadderEvidence(root, row);
    assert.equal((await compareLadderDirectory(root, manifest))[0].state, 'measured');
    const repeat = { ...rows[0], attemptId: 'retry' }; await persistLadderEvidence(root, repeat);
    assert.match((await compareLadderDirectory(root, manifest))[0].reason, /explicit attempt disposition/);
    const attemptDispositions = { [rows[0].attemptId]: { state: 'excluded', reason: 'peer reviewed repeat' }, retry: { state: 'selected', reason: 'peer selected repeat' } };
    assert.equal((await compareLadderDirectory(root, manifest, { attemptDispositions }))[0].state, 'measured');
    const legacy = { ...rows[0], schemaVersion: 2 }; delete legacy.sessionId;
    await writeFile(`${root}/plain-bulb-r1-paced-0-L0.json`, JSON.stringify(legacy));
    assert.match((await compareLadderDirectory(root, manifest, { attemptDispositions }))[0].reason, /session ID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
