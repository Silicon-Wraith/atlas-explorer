import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { clockBand, summarizeGpuClocks, compareGpuClocks, startGpuClockMonitor } from '../support/gpu-clock-evidence.mjs';
import { compareLadder } from '../support/space-performance-ladder.mjs';
import { classifyAttempt, classifyTrials, capturePerformanceAttempt, createPerformanceAttempt } from '../support/space-performance.mjs';
import { cleanupState } from '../support/bounded.mjs';

const start = Date.UTC(2026, 9, 22, 12);
const windows = { orbit: { start, end: start + 1000 } };
const csv = (clock = 210, at = start, uuid = 'GPU-test') => `${new Date(at).toISOString().replace('T', ' ').replace('Z', '').replaceAll('-', '/')}, ${uuid}, ${clock}, P8, 29.5\n`;
const raw = (clock = 210) => Array.from({ length: 11 }, (_, i) => csv(clock, start + i * 100)).join('');
const summary = clock => summarizeGpuClocks({ raw: raw(clock), errors: [] }, windows);
const registeredSummary = clock => ({ protocol: 'atlas.gpu-clocks-v1', state: 'measured', medianMHz: clock,
  band: clock < 270 ? 'lt270' : clock < 600 ? '270-600' : clock < 1200 ? '600-1200' : 'ge1200', bandShare: 1,
  sampleCount: 11, uuid: 'GPU-test' });
const clockEvidence = clock => ({ ...registeredSummary(clock), latency: registeredSummary(clock), phases: { orbit: registeredSummary(clock) } });
const manifest = JSON.parse(await readFile('tests/reference/performance-ladder-v1.json'));
const ladder = () => manifest.order.flatMap((rung, position) => ['paced', 'unpaced'].map(mode => ({
  schema: 'atlas.performance-ladder-evidence', schemaVersion: 3, sessionId: 'one', attemptId: `${position}-${mode}`,
  cell: { rung, position, mode }, classification: { state: 'measured' }, cleanup: { state: 'confirmed' },
  clockEvidence: clockEvidence(mode === 'paced' ? 210 : 2505),
  metrics: { latencyP95Ms: 10, benchmarkDraftsPerSecond: 100, confirmedDraftsPerSecond: 100, failures: [] },
})));

test('B15-O1b clock bands have frozen half-open edges and reject unavailable values', () => {
  assert.deepEqual([210, 225, 269, 270, 300, 599, 600, 780, 1199, 1200, 2505].map(clockBand),
    ['lt270', 'lt270', 'lt270', '270-600', '270-600', '270-600', '600-1200', '600-1200', '600-1200', 'ge1200', 'ge1200']);
  for (const value of [0, -1, NaN, null, Infinity, '210']) assert.equal(clockBand(value), null);
});

test('B15-O1b summaries use measured windows and preserve clock pstate and power samples', () => {
  const result = summarizeGpuClocks({ raw: csv(2505, start - 1000) + raw(210) + csv(2505, start + 2000), errors: [] }, windows);
  assert.equal(result.state, 'measured'); assert.equal(result.medianMHz, 210); assert.equal(result.band, 'lt270');
  assert.equal(result.sampleCount, 11); assert.equal(result.samples.length, 13, 'raw out-of-window evidence retained');
  assert.equal(result.phases.orbit.pstateCounts.P8, 11); assert.equal(result.powerDrawMedianW, 29.5);
  assert.equal(result.latency.medianMHz, 210); assert.equal(result.bandShare, 1);
});

test('B15-O1b missing malformed sparse ambiguous and errored telemetry is unavailable', () => {
  for (const capture of [
    { raw: '' }, { raw: raw().replace('210', 'N/A') }, { raw: raw().replace('29.5', 'N/A') }, { raw: raw().replace('P8', 'unknown') },
    { raw: csv(210) + csv(210, start + 1000) }, { raw: raw(), errors: ['monitor error'] },
    { raw: raw() + csv(210, start + 200, 'GPU-other') },
  ]) {
    const result = summarizeGpuClocks(capture, windows);
    assert.equal(result.state, 'unavailable'); assert.ok(result.reason, 'explicit sampling failure reason');
  }
  assert.equal(summarizeGpuClocks({ raw: raw() }, {}).state, 'unavailable');
});

test('B15-O1b same-band comparison enforces ten percent median tolerance and ninety percent occupancy', () => {
  assert.equal(compareGpuClocks([summary(210), summary(225)]).state, 'comparable');
  for (const clocks of [[210, 300], [269, 270], [300, 400], [2505, 3000]]) assert.equal(compareGpuClocks(clocks.map(summary)).state, 'inconclusive');
  assert.equal(compareGpuClocks([summary(300), summary(330)]).state, 'comparable');
  assert.equal(compareGpuClocks([summary(300), summary(330.1)]).state, 'inconclusive');
  const mixed = summarizeGpuClocks({ raw: raw().replace(csv(210), csv(780)).replace(csv(210, start + 100), csv(780, start + 100)) }, windows);
  assert.equal(mixed.state, 'measured', 'mixed clocks still describe a real acceptance condition');
  assert.equal(compareGpuClocks([summary(210), mixed]).state, 'inconclusive');
  assert.equal(compareGpuClocks([undefined, summary(210)]).state, 'inconclusive');
});

test('B15-O1b ladder budgets gate both metric populations and their L0 brackets without a cross-mode requirement', () => {
  assert.equal(compareLadder(ladder(), manifest).state, 'measured', 'paced and unpaced may occupy different regimes');
  for (const mutate of [
    rows => { rows.find(r => r.cell.rung === 'L1' && r.cell.mode === 'paced').clockEvidence = clockEvidence(300); },
    rows => { rows.find(r => r.cell.rung === 'L1' && r.cell.mode === 'unpaced').clockEvidence = clockEvidence(780); },
    rows => { rows.at(-2).clockEvidence = clockEvidence(300); },
    rows => { delete rows[0].clockEvidence; },
    rows => { rows[0].clockEvidence = {state:'unavailable'}; rows[0].clockErrors=['sampling failed']; rows[0].classification={state:'inconclusive',clockSampling:'unavailable'}; },
  ]) {
    const rows = ladder(); mutate(rows); const result = compareLadder(rows, manifest);
    assert.equal(result.state, 'inconclusive');
    assert.equal(result.comparisons.find(c => c.rung === 'L1').state, 'inconclusive');
    assert.equal(result.comparisons.find(c => c.rung === 'L1').latency, undefined, 'no normalized win/loss for incompatible clocks');
  }
});

test('B15-O1b P3 accepts every measured band but missing telemetry cannot pass or erase application failure', () => {
  const base = { ...createPerformanceAttempt(1), complete: true, coverage: true, targets: [{ passed: true }] };
  assert.equal(classifyAttempt(base).state, 'inconclusive');
  const attempts = [210, 780, 2505].map(clock => ({ ...base, clockEvidence: registeredSummary(clock) }));
  assert.equal(classifyTrials(attempts).state, 'passed', 'acceptance is absolute, not a cross-trial speed comparison');
  assert.equal(classifyAttempt({ ...base, clockEvidence: { state: 'unavailable', reason: 'sampling failed' } }).state, 'inconclusive');
  assert.equal(classifyAttempt({ ...base, applicationFailure: 'cadence below 30/s' }).state, 'failed');
  assert.equal(classifyAttempt({...base,clockEvidence:{...registeredSummary(210),bandShare:.5}}).state,'passed','mixed clocks are an observed acceptance condition');
});

test('B15-O1b monitor issues only a read-only 100 ms query and confirms escalation cleanup', async () => {
  const monitor = new EventEmitter(); monitor.stdout = new EventEmitter(); monitor.stderr = new EventEmitter();
  const signals = []; monitor.kill = signal => { signals.push(signal); if (signal === 'SIGKILL') monitor.emit('close', null, signal); };
  let command, args, options, waits = 0;
  const capture = startGpuClockMonitor({ spawnMonitor: (...call) => { [command, args, options] = call; return monitor; },
    wait: async promise => { if (++waits === 1) throw Error('TERM timed out'); return promise; } });
  assert.ok(capture, 'monitor interface exists');
  monitor.stdout.emit('data', raw());
  const result = await capture.stop();
  assert.equal(command, 'nvidia-smi'); assert.deepEqual(args, ['--query-gpu=timestamp,uuid,clocks.sm,pstate,power.draw', '--format=csv,noheader,nounits', '--loop-ms=100']);
  assert.equal(options.env.TZ, 'UTC'); assert.equal(result.raw, raw());
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']); assert.equal(result.cleanup.state, 'confirmed'); assert.equal(waits, 2);
  const missing = await startGpuClockMonitor({spawnMonitor:()=>{throw Error('nvidia-smi missing');}}).stop();
  assert.equal(missing.cleanup.state,'confirmed'); assert.match(missing.errors[0],/missing/);
  assert.equal(summarizeGpuClocks(missing,windows).state,'unavailable');
});

test('B15-O1b P3 wraps every measured attempt and saves sampling and cleanup failures before stopping', async () => {
  for (const cleanup of ['confirmed', 'unconfirmed']) {
    const attempt = {}, order = [], exits = [];
    try {
      const run = capturePerformanceAttempt(attempt, async () => { order.push('run'); throw Error('work failed'); },
        async () => { order.push('collect'); return { timeOriginMs: start, phases: { orbit: { start: 0, end: 1000 } } }; }, {
          startMonitor: () => { order.push('start'); return { stop: async () => { order.push('stop'); return { raw: raw(), errors: [], cleanup: { state: cleanup } }; } }; },
          persist: async () => { order.push('persist'); assert.equal(attempt.clockEvidence.medianMHz, 210); },
          exit: code => { exits.push(code); assert.equal(order.at(-1), 'persist'); },
        });
      if (cleanup === 'unconfirmed') await assert.rejects(run, /CLEANUP-UNCONFIRMED/); else await run;
      assert.deepEqual(order, ['start', 'run', 'collect', 'stop', 'persist']);
      assert.match(attempt.error, /work failed/); assert.equal(attempt.clockEvidence.medianMHz, 210);
      assert.deepEqual(exits, cleanup === 'unconfirmed' ? [125] : []);
      assert.equal(cleanupState.unconfirmed, cleanup === 'unconfirmed');
    } finally { cleanupState.unconfirmed = false; }
  }
});
