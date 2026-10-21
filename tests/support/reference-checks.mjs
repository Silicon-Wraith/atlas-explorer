// Complete CPU regeneration lives outside the ten-second unit-file budget.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import { REFERENCE_CHECKS, REFERENCE_WORK_MS, validateReferenceReport } from '../../scripts/gate/reference-evidence.mjs';
import { generateMatrix, matrixIsQualifiable, materializePerformance, predictCheckpoint, serialize, sha256,
  matrixHeader, generateStrata, generateUsability, createMatrixIndex, loadMatrix } from '../reference/matrix.mjs';
import { quaternionOrbit, quaternionBound, admitsRequestedComponent } from '../reference/quaternion.js';
import { traceModel } from '../reference/trace.js';
import { prepareAnchor } from '../reference/anchors.mjs';
const dir = new URL('../reference/', import.meta.url);
const bytes = name => readFileSync(new URL(name, dir));
const json = name => JSON.parse(bytes(name));
const profile = { name: 'surface-v1', height: 720, verticalFovDegrees: 60, maxSteps: 512 };

function artifactIdentities() {
  const index = json('space-matrix.json');
  return { matrixSha256: index.matrixSha256, indexSha256: sha256(bytes('space-matrix.json')),
    generatorSha256: sha256(bytes('matrix.mjs')), predictionSha256: sha256(bytes('performance-predictions.json')),
    workloadSha256: sha256(bytes('performance-workload.json')) };
}

export async function runReferenceChecks({ checks, identities, now = () => performance.now(), onPass = () => {}, onProgress = () => {} } = {}) {
  const start = now();
  const checkDeadline = () => {
    if (now() - start >= REFERENCE_WORK_MS) throw Object.assign(new Error('reference suite work deadline exceeded'), { code: 'ATLAS_REFERENCE_TIMEOUT' });
  };
  checks ??= completeChecks();
  identities ??= artifactIdentities();
  assert.deepEqual(checks.map(check => check.name), Object.keys(REFERENCE_CHECKS), 'complete reference checks required');
  const report = [];
  for (const check of checks) {
    checkDeadline();
    const began = now();
    const checked = await check.run({ checkDeadline, progress: onProgress });
    checkDeadline();
    assert.deepEqual(checked, REFERENCE_CHECKS[check.name], `reference coverage: ${check.name}`);
    const entry = { name: check.name, state: 'passed', checked, identities: { ...identities }, durationMs: now() - began };
    report.push(entry); onPass(entry);
  }
  const validation = validateReferenceReport({ requiredPasses: Object.keys(REFERENCE_CHECKS) }, report);
  assert.equal(validation.ok, true, validation.detail);
  return report;
}

function completeChecks() {
  return [
    { name: 'P1 complete matrix regeneration', run: async ({ checkDeadline, progress }) => {
      const committed = loadMatrix(), regenerated = [];
      for (const actual of generateStrata()) {
        checkDeadline();
        const expected = committed.strata[regenerated.length];
        assert.ok(expected, `unexpected stratum ${actual.id}`);
        assert.equal(serialize(actual), serialize(expected), actual.id);
        regenerated.push(actual);
        if (regenerated.length % 32 === 0) { progress(`P1 ${regenerated.length}/${committed.strata.length}`); await yieldToEventLoop(); }
      }
      assert.equal(regenerated.length, committed.strata.length);
      assert.equal(serialize(generateMatrix({ seed: 1, strata: regenerated })), serialize(committed));
      checkPointCoverage(committed, regenerated);
      checkAnchors(committed);
      checkDeadline();
      return { strata: regenerated.length, mandatory: regenerated.filter(row => row.role === 'mandatory').length,
        anchors: committed.anchors.length, shards: json('space-matrix.json').shards.length };
    } },
    { name: 'P2 quaternion usability regeneration', run: () => {
      const prediction = generateUsability();
      assert.deepEqual(prediction.settings.camera.positionLocal, [1.92, -1.44, 0.7]);
      assert.equal(prediction.acceptance.perClassAbsoluteFraction, 0.05);
      assert.deepEqual(prediction, json('quaternion-usability.json'));
      return { rays: prediction.rays };
    } },
    { name: 'P3 complete workload and prediction regeneration', run: async ({ checkDeadline, progress }) => {
      const workload = json('performance-workload.json'), predictions = json('performance-predictions.json');
      const regenerated = [];
      for (const expected of predictions.checkpoints) {
        const scene = workload.scenes.find(scene => scene.id === expected.sceneId);
        assert.ok(scene, expected.sceneId);
        const checkpoint = workload.coverageCheckpoints.materialized[scene.id].find(checkpoint => checkpoint.predictionId === expected.id);
        assert.ok(checkpoint, expected.id);
        const counts = Object.fromEntries(Object.keys(expected.counts).map(key => [key, 0]));
        for (let row = 0; row < expected.height; row += 16) {
          checkDeadline();
          const band = predictCheckpoint(scene, checkpoint, workload.output, { rowStart: row, rowEnd: Math.min(row + 16, expected.height) });
          assert.equal(Object.values(band.counts).reduce((a, b) => a + b, 0), expected.width * Math.min(16, expected.height - row));
          for (const key of Object.keys(counts)) counts[key] += band.counts[key];
          await yieldToEventLoop();
        }
        const actual = predictCheckpoint(scene, checkpoint, workload.output, { counts });
        assert.deepEqual(actual, expected); regenerated.push(actual);
        progress(`P3 ${regenerated.length}/${predictions.checkpoints.length}`);
      }
      const actual = { schema: 'atlas.performance-predictions', version: 1, referenceSha256: matrixHeader().referenceSha256, checkpoints: regenerated };
      assert.equal(serialize(actual), bytes('performance-predictions.json').toString());
      assert.equal(sha256(serialize(actual)), workload.predictionArtifact.sha256);
      assert.equal(serialize(materializePerformance(workload, actual)), bytes('performance-workload.json').toString());
      return { scenes: workload.scenes.length,
        orbitPoses: Object.values(workload.workloads.orbit.cameraPoses).reduce((n, poses) => n + poses.length, 0),
        interactionPoses: Object.values(workload.workloads.interaction.cameraPoses).reduce((n, poses) => n + poses.length, 0),
        checkpoints: regenerated.length, rays: regenerated.reduce((n, checkpoint) => n + checkpoint.rays, 0) };
    } },
  ];
}

function checkPointCoverage(committed, regenerated) {
  const points = () => regenerated.filter(row => !['adversarial-ray', 'analytic-ray', 'fractal-overview', 'detail-ladder'].includes(row.kind));
  // κ = ±4 strata contain only empty-slice assertions
  {
    const matrix = { strata: points() };
    const strata = matrix.strata.filter(s => s.kind === 'quaternion-generic' && Math.abs(s.parameters.kappa) === 4);
    assert.equal(strata.length, 6 * 2 * 4);
    for (const stratum of strata) {
      assert.equal(stratum.floor.continuous, 0); assert.equal(stratum.floor.semantic, 256);
      assert.equal(stratum.excluded.length, 0);
      for (const c of stratum.cases) {
        const { C, kappa } = c.inputs.parameters;
        assert.ok(Math.abs(kappa) > quaternionBound(C));
        assert.equal(quaternionOrbit([...c.inputs.effective, kappa], C, c.inputs.cap).escapeIndex, 0);
        assert.equal(traceModel('quaternion-julia', { C, kappa }, { origin: [0, -5, 0], direction: [0, 1, 0] }, profile).status, 'miss');
      }
    }
  }
  // the frozen boundary strata retain every semantic case and exact decimal rejection
  {
    const rows = points().filter(s => s.kind === 'quaternion-boundary');
    assert.equal(rows.length, 24 * 7 * 4);
    assert.equal(rows.reduce((n, s) => n + s.cases.length, 0), 5376);
    for (const row of rows) {
      assert.equal(row.excluded.length, 0);
      for (const c of row.cases) {
        assert.equal(c.expected.admitted, true);
        const { C, kappa } = c.inputs.parameters;
        const bound = quaternionBound(C);
        assert.ok(bound >= Math.max(2, (1 + Math.sqrt(1 + 4 * Math.hypot(...C))) / 2));
        assert.equal(c.expected.emptySlice, Math.abs(kappa) > bound);
        const live = quaternionOrbit([...c.inputs.effective, kappa], C, c.inputs.cap, { bound });
        assert.notEqual(live.status, 'numerical failure');
        if (c.expected.emptySlice) assert.equal(live.escapeIndex, 0);
      }
      for (const c of row.rejectionCases) {
        assert.equal(c.expected, 'out-of-range'); assert.equal(admitsRequestedComponent(c.requested), false);
      }
    }
  }
  // the approved power-7 floor changes no other power or candidate grid
  {
    const rows = points().filter(s => s.kind === 'bulb-generic');
    assert.equal(rows.length, 28);
    for (const row of rows) {
      assert.equal(row.cases.length, 512);
      assert.equal(row.floor.continuous, row.parameters.power === 7 ? 400 : 410);
      assert.equal(row.state, 'frozen');
      if (row.parameters.power === 7) assert.equal(row.eligible.continuous, 408);
    }
  }
  // the matrix generator is deterministic and its output matches the committed index whole-matrix sha256
  {
    const index = json('space-matrix.json');
    assert.equal(index.shards.length, 18); assert.equal(index.stratumOrder.length, 1123);
    assert.equal(sha256(serialize(committed)), index.matrixSha256);
    assert.equal(serialize(createMatrixIndex(committed).index), serialize(index));
    const { strata, anchors, ...header } = committed;
    assert.deepEqual(header, matrixHeader({ seed: committed.seed }));
    assert.equal(committed.analysis.sha256, matrixHeader().analysis.sha256);
    assert.equal(matrixIsQualifiable(committed), true);
    assert.deepEqual(generateMatrix({ strata: [] }), generateMatrix({ strata: [] }));
    assert.equal(matrixHeader().tolerances.usabilityDistribution.value, 0.05);
    assert.equal(Object.hasOwn(matrixHeader().tolerances, 'distribution'), false);
  }
}

function checkAnchors(committed) {
  const anchors = committed.anchors;
  assert.equal(anchors.length, 18);
  for (const anchor of anchors) {
    assert.deepEqual(anchor.convergence.tolerances, [1e-13, 1e-15]);
    assert.equal(anchor.convergence.converged, true, anchor.id);
    const result = prepareAnchor(anchor.model, anchor.effective, anchor.seedRay);
    assert.deepEqual(result.anchor, anchor.anchor); assert.deepEqual(result.convergence, anchor.convergence);
    assert.ok(anchor.convergence.deltaT <= anchor.convergence.limit);
  }
}
