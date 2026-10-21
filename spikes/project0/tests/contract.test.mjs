import test from 'node:test';
import assert from 'node:assert/strict';
import { GATES, canonical } from '../contract.js';
import {
  percentile, throughput, compareArithmetic, compareRays, coverageValid
} from '../metrics.js';
import { evaluateGate } from '../gates.js';
import { decideBackends } from '../decision.js';

const fixtures = {
  analytic: {
    sphere: { rays: Array(625) },
    box: { rays: Array(651) },
    'menger-1': { rays: Array(1681) },
    'menger-2': { rays: Array(1681) }
  },
  arithmetic: {
    bulb: Array.from({ length: 4096 }, () => ({ eligible: true })),
    plane: Array.from({ length: 4096 }, () => ({ eligible: true }))
  }
};

function throughputEvidence() {
  const identity = {
    backend: 'webgpu',
    fixtureHash: 'a'.repeat(64),
    fixtureCommit: 'b'.repeat(40),
    specHash: 'c'.repeat(64),
    implementationCommit: 'd'.repeat(40),
    implementationHash: 'e'.repeat(64),
    launchHash: 'f'.repeat(64),
    browserVersion: 'test-browser',
    browserExecutable: '/test/chrome',
    driver: 'test-driver',
    session: 'test-session',
    mode: 'headed'
  };
  const manifest = {
    fixture: {
      fixtureHash: identity.fixtureHash,
      fixtureCommit: identity.fixtureCommit,
      specHash: identity.specHash
    },
    trials: {}
  };
  const records = [];
  for (const name of [
    'bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005'
  ]) {
    for (let trial = 0; trial < 3; trial++) {
      const slot = `${name}/${trial}`;
      const id = `G6-${records.length}`;
      manifest.trials[`G6/${slot}`] = { id, identity };
      records.push({
        schema: 1, id, gate: 'G6', slot, identity,
        invalidations: [],
        artifacts: [{ path: `${id}.json`, sha256: '1'.repeat(64) }],
        metrics: {
          windowMs: 30000,
          published: 900,
          intervalP95: 50,
          pendingMax: 1,
          coverageErrors: 0,
          outstandingMax: 2
        }
      });
    }
  }
  return { records, manifest };
}

test('nearest rank and G6 count completed distinct publications', () => {
  assert.equal(percentile(Array.from({ length: 20 }, (_, i) => i + 1), .95), 19);
  const rows = Array.from({ length: 900 }, (_, i) => ({
    id: i, time: i * 1000 / 30
  }));
  const result = throughput(rows, 0, 30000);
  assert.equal(result.published, 900);
  assert.ok(result.intervalP95 < 34);
  assert.throws(() => throughput([...rows, rows[0]], 0, 30000), /duplicate/);
  assert.throws(() => canonical({ value: NaN }), /nonfinite/);
});

test('arithmetic exclusions and analytic edge cases keep separate semantics', () => {
  const expected = [
    {
      id: 0, eligible: true,
      reference: { status: 'escaped', index: 2, logR: 2, de: .25 }
    },
    {
      id: 1, eligible: false,
      reference: { status: 'budget', index: null }
    }
  ];
  const actual = [
    { id: 0, status: 'escaped', index: 2, logR: 2, de: .25 },
    { id: 1, status: 'failure', index: null }
  ];
  const comparison = compareArithmetic(expected, actual, { logR: 1e-4, de: 1e-3 });
  assert.equal(comparison.eligible, 1);
  assert.equal(comparison.diagnostics, 1);
  assert.equal(comparison.statusErrors, 0);
  actual[0].index = 3;
  assert.equal(compareArithmetic(expected, actual, { logR: 1e-4 }).indexErrors, 1);

  const rays = [{
    id: 0, reference: { status: 'miss', t: null, excluded: true }
  }];
  assert.equal(compareRays(rays, [{
    id: 0, status: 'unresolved', reason: 'steps', t: null
  }], 1).edgeErrors, 0);
  assert.equal(compareRays(rays, [{
    id: 0, status: 'failure', t: null
  }], 1).edgeErrors, 1);
});

test('coverage cannot pass an empty, incomplete or failed image', () => {
  const counts = { total: 100, hit: 28, miss: 72, point: 0, steps: 0, failure: 0 };
  assert.equal(coverageValid('bulb-overview', counts), true);
  assert.equal(coverageValid('bulb-overview', { ...counts, hit: 0, miss: 100 }), false);
  assert.equal(coverageValid('bulb-overview', { ...counts, failure: 1 }), false);
  assert.equal(coverageValid('sphere', {
    total: 100, hit: 10, miss: 89, point: 0, steps: 1, failure: 0
  }), false);
});

test('gate evaluation rejects missing, mixed, duplicate and invalid evidence', () => {
  const { records, manifest } = throughputEvidence();
  const evaluate = rows => evaluateGate('G6', rows, manifest, fixtures).status;
  assert.equal(evaluate(records), 'pass');

  records[0].metrics.published = 899;
  assert.equal(evaluate(records), 'fail');
  records[0].metrics.published = 900;

  assert.equal(evaluate(records.slice(1)), 'invalid/inconclusive');
  assert.equal(evaluate([...records, records[0]]), 'invalid/inconclusive');

  const mixed = structuredClone(records);
  mixed[0].identity.fixtureHash = '9'.repeat(64);
  assert.equal(evaluate(mixed), 'invalid/inconclusive');

  const corrupt = structuredClone(records);
  corrupt[0].metrics.intervalP95 = NaN;
  assert.equal(evaluate(corrupt), 'invalid/inconclusive');

  const wrongCoverage = structuredClone(records);
  wrongCoverage[0].metrics.coverageErrors = 1;
  assert.equal(evaluate(wrongCoverage), 'invalid/inconclusive');
});

test('selection cannot turn missing evidence into backend failure', () => {
  const passing = {
    remediationClosed: false,
    gates: Object.fromEntries(GATES.map(g => [g, { status: 'pass' }]))
  };
  assert.equal(decideBackends(passing).outcome, 'WebGPU selected');

  const failed = structuredClone(passing);
  failed.gates.G8 = { status: 'fail' };
  failed.remediationClosed = true;
  assert.equal(decideBackends(failed).outcome, 'inconclusive');
  assert.equal(decideBackends(failed, passing).outcome, 'WebGL 2 selected');
  assert.equal(decideBackends(failed, failed).outcome, 'no-go');

  const incomplete = structuredClone(failed);
  incomplete.gates.G12 = { status: 'invalid/inconclusive' };
  assert.equal(decideBackends(incomplete, failed).outcome, 'inconclusive');

  const stopped = structuredClone(failed);
  stopped.gates.G12 = {
    status: 'not run', blockedBy: 'G8', reason: 'Stopped after the measured failure'
  };
  assert.equal(decideBackends(stopped, failed).outcome, 'no-go');
});

test('unknown statuses are invalid even for excluded samples', () => {
  const arithmetic = [{
    id: 0,
    eligible: false,
    reference: { status: 'budget', index: null }
  }];
  assert.throws(
    () => compareArithmetic(arithmetic, [{ id: 0, status: 'typo' }], {}),
    /unknown arithmetic status/
  );

  const rays = [{
    id: 0,
    reference: { status: 'miss', t: null, excluded: true }
  }];
  assert.throws(
    () => compareRays(rays, [{ id: 0, status: 'typo' }], 1),
    /unknown ray status/
  );
  assert.throws(
    () => compareRays(rays, [{
      id: 0, status: 'unresolved', reason: 'typo'
    }], 1),
    /unknown unresolved reason/
  );
});
