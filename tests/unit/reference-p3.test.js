// Fast P3 contracts; every prediction pixel is recomputed by tests/reference.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cameraBasis, rayFor, yawCamera } from '../reference/camera.js';
import { materializePerformance, serialize, sha256 } from '../reference/matrix.mjs';

const dir = new URL('../reference/', import.meta.url);
const json = name => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const bytes = name => readFileSync(new URL(name, dir));
const close = (a, b, tolerance = 1e-12) => assert.ok(Math.abs(a - b) <= tolerance, `${a} versus ${b}`);

test('P3 materialization is deterministic and its output matches the committed bytes', () => {
  const workload = json('performance-workload.json'), predictions = json('performance-predictions.json');
  const a = materializePerformance(workload, predictions), b = materializePerformance(workload, predictions);
  assert.equal(serialize(a), serialize(b)); assert.equal(serialize(a), bytes('performance-workload.json').toString());
  assert.equal(a.predictionArtifact.sha256, sha256(serialize(predictions)));
});

test('P3 has 1875 / 400 / 5 records and exact times with continuous orbit and interaction yaw', () => {
  const manifest = json('performance-workload.json');
  for (const scene of manifest.scenes) {
    const orbit = manifest.workloads.orbit.cameraPoses[scene.id], interaction = manifest.workloads.interaction.cameraPoses[scene.id];
    assert.equal(orbit.length, 1875); assert.equal(interaction.length, 400);
    assert.equal(manifest.coverageCheckpoints.materialized[scene.id].length, 5);
    for (const [k, record] of orbit.entries()) { assert.equal(record.requestIndex, k); assert.equal(record.requestTimeMs, 16 * k); }
    for (const [k, record] of interaction.entries()) { assert.equal(record.requestIndex, k + 1); assert.equal(record.requestTimeMs, 60 * (k + 1)); }
    assert.equal(0.5 * orbit[1874].requestTimeMs / 1000, 14.992);
    assert.deepEqual(orbit[0].camera, scene.scene.camera);
    assert.deepEqual(orbit[1874].camera, yawCamera(scene.scene.camera, 14.992));
    assert.deepEqual(interaction[0].camera, yawCamera(scene.scene.camera, 14.992 + 0.03));
    assert.deepEqual(interaction[399].camera, yawCamera(scene.scene.camera, 26.992));
    assert.equal(interaction[399].requestTimeMs, 24000);
  }
  assert.equal(manifest.materialization.formats['coverageCheckpoints.materialized'].settledOrbitIndex, 1874);
});

test('every P3 camera is finite and upright and every scene retains its exact requested parameters', () => {
  const manifest = json('performance-workload.json');
  for (const scene of manifest.scenes) {
    assert.equal(scene.scene.schema, 'atlas.scene'); assert.equal(scene.scene.schemaVersion, 1);
    assert.deepEqual(scene.scene.parameters, scene.parameters);
    const baseDistance = Math.hypot(...scene.scene.camera.positionLocal);
    for (const { camera } of [...manifest.workloads.orbit.cameraPoses[scene.id], ...manifest.workloads.interaction.cameraPoses[scene.id]]) {
      assert.equal(camera.kind, 'anchored-perspective-v1'); assert.deepEqual(camera.focusLocal, [0, 0, 0]);
      for (const value of [...camera.positionLocal, ...camera.focusLocal, ...camera.orientationWxyz, camera.verticalFovDegrees, camera.scale.mantissa, camera.scale.exponent]) assert.ok(Number.isFinite(value));
      const basis = cameraBasis(camera); close(basis.right[2], 0); assert.ok(basis.up[2] > 0);
      close(Math.hypot(...camera.orientationWxyz), 1); close(Math.hypot(...camera.positionLocal), baseDistance);
      const ray = rayFor(camera, 639.5, 359.5, 1280, 720);
      ray.direction.forEach((v, i) => close(v, -ray.origin[i] / baseDistance));
    }
  }
});

test('P3 readiness, prediction hash and absent embedded self hash are enforced', () => {
  const manifest = json('performance-workload.json');
  assert.equal(manifest.readyForAcceptance, manifest.unresolved.length === 0);
  assert.equal(manifest.readyForAcceptance, true);
  assert.equal(manifest.predictionArtifact.sha256, createHash('sha256').update(bytes('performance-predictions.json')).digest('hex'));
  const selfHash = createHash('sha256').update(bytes('performance-workload.json')).digest('hex');
  assert.ok(!bytes('performance-workload.json').toString().includes(selfHash));
  const hashes = [];
  function visit(value, path = '') { if (value && typeof value === 'object') for (const [key, v] of Object.entries(value)) { if (typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)) hashes.push(`${path}${key}`); visit(v, `${path}${key}.`); } }
  visit(manifest); assert.deepEqual(hashes, ['predictionArtifact.sha256']);
});

const predictions = json('performance-predictions.json');

test('P3 retains unresolved dependencies when checkpoint predictions are missing', () => {
  const manifest = json('performance-workload.json');
  const incomplete = materializePerformance(manifest, { ...predictions, checkpoints: predictions.checkpoints.slice(1) });
  assert.equal(incomplete.readyForAcceptance, false); assert.ok(incomplete.unresolved.length > 0);
});

test('every P3 checkpoint rejects an all-miss image and any numerical failure', () => {
  for (const checkpoint of predictions.checkpoints) {
    assert.ok(checkpoint.acceptance.ranges.hit[0] > 0, checkpoint.id);
    assert.ok(checkpoint.acceptance.ranges.miss[1] < checkpoint.rays, checkpoint.id);
    assert.deepEqual(checkpoint.acceptance.ranges.numericalFailure, [0, 0]);
  }
});
