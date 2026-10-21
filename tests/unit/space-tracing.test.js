// Plan B10: Node-side ray-stratum comparison (tests/support/space-tracing.mjs) and the tracing and
// geometric validation records (validation-records.js). No GPU: synthetic results exercise the frozen
// P1/P2 rules on the real frozen strata loaded through the pinned index.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  loadPinnedRayStrata, analyticReportRow, compareAnalyticStratum, compareAdversarialRays, compareOverviewStratum, compareLadderStratum, compareUsability, terminationCounts, sphereSilhouette,
} from '../support/space-tracing.mjs';
import {
  buildTracingRecords, buildGeometricRecords, createValidationRegistry, requiredTracingStrata, TRACING_RECORD_IDS, USABILITY_STRATUM, ADVERSARIAL_RAY_STRATUM, MATRIX_PINS,
} from '../../src/space/numerics/validation-records.js';

const view = loadPinnedRayStrata({ kinds: ['analytic-ray', 'adversarial-ray', 'fractal-overview'] });
const byId = id => view.strata.find(row => row.id === id);
const echo = row => row.cases.map(c => ({ status: c.expected.status, reason: c.expected.reason ?? null, subreason: c.expected.subreason ?? null, detail: c.expected.detail ?? null, t: c.expected.t ?? 0, steps: 1 }));

test('ray strata load through the pinned index as a partial view with their shard identities', () => {
  assert.equal(view.complete, false);
  assert.equal(view.matrixSha256, MATRIX_PINS.matrixSha256);
  assert.deepEqual(view.shards.map(s => s.kind).sort(), ['adversarial-ray', 'analytic-ray', 'fractal-overview']);
  assert.equal(view.strata.filter(row => row.kind === 'fractal-overview').length, 49);
  assert.throws(() => loadPinnedRayStrata({ kinds: ['bulb-generic'] }), /ray strata/);
});

test('analytic rays pass on exact statuses and depths within the frozen tolerance, and fail otherwise', () => {
  const row = byId('analytic/sphere'), ok = echo(row);
  const passed = compareAnalyticStratum(row, ok, view.tolerances);
  assert.equal(passed.state, 'passed'); assert.deepEqual(passed.eligible, row.eligible);
  const i = row.cases.findIndex(c => c.referenceEligible && c.expected.status === 'approximate hit');
  const deep = ok.map((r, k) => (k === i ? { ...r, t: r.t * (1 + 2e-3) } : r));
  assert.equal(compareAnalyticStratum(row, deep, view.tolerances).failures[0].quantity, 'depth');
  // A depth-excluded (tangent margin) case is still compared on status.
  const j = row.cases.findIndex(c => !c.referenceEligible);
  const flipped = ok.map((r, k) => (k === j ? { ...r, status: r.status === 'miss' ? 'approximate hit' : 'miss' } : r));
  assert.equal(compareAnalyticStratum(row, flipped, view.tolerances).failures[0].quantity, 'status');
  const failure = ok.map((r, k) => (k === 0 ? { ...r, status: 'numerical failure' } : r));
  assert.equal(compareAnalyticStratum(row, failure, view.tolerances).passed, false);
});

test('adversarial rays compare status, reason, subreason and the interior detail exactly', () => {
  const row = byId(ADVERSARIAL_RAY_STRATUM), ok = echo(row);
  assert.equal(compareAdversarialRays(row, ok).state, 'passed');
  const k = row.cases.findIndex(c => c.id === 'stagnation-field-coordinate');
  assert.deepEqual(compareAdversarialRays(row, ok.map((r, i) => (i === k ? { ...r, subreason: 'ray-parameter' } : r))).failures.map(f => f.quantity), ['subreason']);
  const interior = row.cases.findIndex(c => c.id === 'sphere-interior');
  assert.deepEqual(compareAdversarialRays(row, ok.map((r, i) => (i === interior ? { ...r, detail: null } : r))).failures.map(f => f.quantity), ['detail']);
});

test('overview strata apply the frozen 5 % status and 95 % within 2τ rules, and κ = ±4 rows must all miss', () => {
  const row = byId('overview/bulb/p8'), ok = echo(row);
  const result = compareOverviewStratum(row, ok);
  assert.equal(result.state, 'passed', JSON.stringify(result.extra));
  const eligible = row.cases.map((c, i) => [c, i]).filter(([c]) => c.referenceEligible);
  const allowed = Math.floor(eligible.length / 20);
  const flip = n => ok.map((r, i) => (eligible.slice(0, n).some(([, k]) => k === i) ? { ...r, status: r.status === 'miss' ? 'unresolved' : 'miss', reason: 'point-budget' } : r));
  assert.equal(compareOverviewStratum(row, flip(allowed)).statusPassed, true);
  assert.equal(compareOverviewStratum(row, flip(allowed + 1)).statusPassed, false);
  const hits = eligible.filter(([c]) => c.expected.status === 'approximate hit' && c.expected.t > 0);
  const shifted = ok.map((r, i) => (hits.slice(0, Math.floor(hits.length / 20) + 1).some(([, k]) => k === i) ? { ...r, t: r.t + 1 } : r));
  assert.equal(compareOverviewStratum(row, shifted).depthPassed, false);
  const excluded = row.cases.findIndex(c => !c.referenceEligible);
  assert.equal(compareOverviewStratum(row, ok.map((r, i) => (i === excluded ? { ...r, status: 'numerical failure' } : r))).passed, false, 'a numerical failure on an excluded ray is a hard failure');
  const empty = byId('overview/quaternion/c0/k4');
  assert.equal(compareOverviewStratum(empty, echo(empty)).passed, true);
  assert.equal(compareOverviewStratum(empty, echo(empty).map((r, i) => (i === 3 ? { ...r, status: 'unresolved', reason: 'point-budget' } : r))).passed, false);
});

test('a ladder row records agreement, exceedance or inconclusive coverage under ladder-v1', () => {
  const ladder = loadPinnedRayStrata({ kinds: ['detail-ladder'] }).strata.find(row => row.id === 'detail/bulb-8/anchor-0/1e-1');
  const ok = echo(ladder);
  assert.equal(compareLadderStratum(ladder, ok).outcome, 'agreement');
  const wrong = ok.map(r => (r.status === 'approximate hit' ? { ...r, t: r.t * 1.02 } : r));
  const exceeded = compareLadderStratum(ladder, wrong);
  assert.equal(exceeded.outcome, 'exceedance'); assert.ok(exceeded.effective.largeErrors > 0);
  assert.equal(compareLadderStratum({ ...ladder, state: 'preparing' }, ok).outcome, 'inconclusive');
});

test('the usability comparison allows ±5 points per class and no numerical failure', () => {
  const prediction = JSON.parse(readFileSync(new URL('../reference/quaternion-usability.json', import.meta.url), 'utf8'));
  const make = (hit, extra = []) => [...Array(hit).fill({ status: 'approximate hit' }), ...extra, ...Array(prediction.rays - hit - extra.length).fill({ status: 'miss' })];
  assert.equal(compareUsability(prediction, make(prediction.distribution.hit)).passed, true);
  assert.equal(compareUsability(prediction, make(prediction.distribution.hit + 720)).passed, true);
  assert.equal(compareUsability(prediction, make(prediction.distribution.hit + 721)).passed, false);
  assert.equal(compareUsability(prediction, make(prediction.distribution.hit, [{ status: 'numerical failure' }])).passed, false);
  assert.equal(terminationCounts([{ status: 'unresolved', reason: 'stagnation', subreason: 'field-coordinate' }])['stagnation:field-coordinate'], 1);
});

test('the analytic sphere silhouette marks a band about one pixel wide at the edge', () => {
  const origin = [0, -5, 0], width = 64, height = 64;
  const rayDirection = (i, j) => { const x = (2 * (i + 0.5) / width - 1) * 0.5, z = (1 - 2 * (j + 0.5) / height) * 0.5, n = Math.hypot(x, 1, z); return [x / n, 1 / n, z / n]; };
  const mask = sphereSilhouette({ origin, rayDirection, width, height });
  const centre = mask[32 * width + 32], corner = mask[0];
  assert.equal(centre.hit, true); assert.equal(centre.edge, false); assert.equal(corner.hit, false); assert.equal(corner.edge, false);
  const edgeRow = mask.slice(32 * width, 33 * width).filter(m => m.edge).length;
  assert.ok(edgeRow >= 2 && edgeRow <= 6, `edge pixels on the centre row: ${edgeRow}`);
});

test('tracing records register only when every covered mandatory stratum passed; geometric records claim agreeing distances only', () => {
  const hashes = { tracingVersion: 'surface-v1/space-trace-v1', 'trace.wgsl': 'x' };
  const ids = [...new Set(TRACING_RECORD_IDS.flatMap(requiredTracingStrata))];
  const pass = id => ({ id, role: 'mandatory', state: 'passed', passed: true, kind: id.startsWith('overview') ? 'fractal-overview' : 'x', parameters: id.startsWith('overview/quaternion') ? { C: [0, 0, 0, 0], kappa: 0 } : {} });
  assert.ok(ids.includes(USABILITY_STRATUM));
  const all = buildTracingRecords({ results: ids.map(pass), implementationHashes: hashes });
  assert.equal(all.records.length, TRACING_RECORD_IDS.length);
  const registry = createValidationRegistry();
  for (const record of all.records) registry.register(record);
  const one = buildTracingRecords({ results: ids.map(id => (id === 'overview/bulb/p4' ? { ...pass(id), state: 'failed', passed: false } : pass(id))), implementationHashes: hashes });
  assert.deepEqual(one.withheld.map(w => w.recordId), ['mandelbulb@1/tracing/p4']);
  const anchors = [{ id: 'bulb-8/anchor-0', model: 'mandelbulb', effective: { power: 8 }, anchor: [0.1, 0.2, 0.3] }];
  const rows = [0.1, 0.01, 1e-8].map((distance, i) => ({ id: `detail/bulb-8/anchor-0/${i}`, role: 'diagnostic', profile: 'ladder-v1', anchorId: 'bulb-8/anchor-0', distance,
    outcome: ['agreement', 'exceedance', 'inconclusive'][i], eligible: {}, effective: {}, requested: {} }));
  const geometric = buildGeometricRecords({ ladders: rows, anchors, implementationHashes: hashes });
  assert.deepEqual(geometric.records[0].testedDomain.distances, [0.1]);
  registry.register(geometric.records[0]);
  const query = { modelId: 'mandelbulb', evidenceClass: 'geometric', implementationHashes: hashes, profile: 'ladder-v1', effective: { power: 8 }, sampling: { maxIterations: 128, maxSteps: 512 } };
  assert.equal(registry.lookup({ ...query, domain: { anchorId: 'bulb-8/anchor-0', anchor: [0.1, 0.2, 0.3], pixels: geometric.records[0].testedDomain.pixels, distance: 0.1 } })?.recordId, 'mandelbulb@1/geometric/bulb-8/anchor-0');
  assert.equal(registry.lookup({ ...query, domain: { anchorId: 'bulb-8/anchor-0', anchor: [0.1, 0.2, 0.3], pixels: geometric.records[0].testedDomain.pixels, distance: 0.01 } }), null, 'no claim at an exceeded distance');
  assert.equal(buildGeometricRecords({ ladders: rows.map(r => ({ ...r, outcome: 'exceedance' })), anchors, implementationHashes: hashes }).records.length, 0);
});

test('B10-F5: the analytic report row keeps the comparator\'s complete status-failure count', () => {
  const row = byId('analytic/sphere'), results = echo(row);
  const hits = row.cases.map((c, i) => [c, i]).filter(([c]) => c.referenceEligible && c.expected.status === 'approximate hit').slice(0, 25);
  for (const [c, i] of hits) results[i] = { ...results[i], t: c.expected.t * 1.01 };
  const last = row.cases.length - 1;
  results[last] = { ...results[last], status: results[last].status === 'miss' ? 'unresolved' : 'miss' };
  const comparison = compareAnalyticStratum(row, results, view.tolerances);
  assert.equal(comparison.statusFailures, 1); assert.ok(comparison.depthFailures >= 25);
  assert.equal(analyticReportRow(comparison).statusFailures, 1, 'the late status failure survives the 20-failure sample');
});
