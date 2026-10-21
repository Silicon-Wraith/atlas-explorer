import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sceneCodec, createSpaceScene, SPACE_DEFAULTS } from '../../src/space/scene-adapter.js';
import { basis, rayDirection } from '../../src/space/camera.js';
import { resolveQuality, PROFILES } from '../../src/space/render/profiles.js';
import { geometryKey, appearanceKey, sampleKey, accumulationKey } from '../../src/space/render/keys.js';
import { createSpaceRequest } from '../../src/space/render-adapter.js';

const size = { width: 1280, height: 720 };
const versions = { kernelVersion: 'fixture-kernel-v1', tracingVersion: 'fixture-tracing-v1' };
const generation = { deviceEpoch: 1, viewRevision: 1, geometryRevision: 1, appearanceRevision: 1 };
const scene = createSpaceScene({ model: 'mandelbulb' });
const quality = () => resolveQuality(scene, 'settled', size);
const key = (s = scene, q = quality(), extra = {}) => geometryKey(s, q, { ...size, ...versions, ...extra });

test('profiles resolve explicit caps, internal dimensions and actual lighting without changing the scene', () => {
  const draft = resolveQuality(scene, 'draft', { width: 7, height: 5 });
  assert.deepEqual(PROFILES.draft, { scale: 0.5, maxIterations: 64, maxSteps: 256, lighting: 'direct', samples: 1, budgetMs: 1000 });
  assert.deepEqual(draft.internalSize, { width: 3, height: 2 });
  assert.equal(draft.iteration.maxIterations, 64); assert.equal(draft.tracing.maxSteps, 256);
  assert.equal(draft.sampling.targetSamples, 1); assert.equal(draft.preview, true);
  assert.deepEqual(draft.lighting, { stage: 'direct', normalFieldSamples: 6, shadowRays: 0, shadowSteps: 0, aoSamples: 0 });
  assert.equal(quality().lighting.stage, 'full'); assert.equal(quality().sampling.targetSamples, 8);
  const low = createSpaceScene({ model: 'sphere', iteration: { ...SPACE_DEFAULTS.iteration, maxIterations: 12 } });
  assert.equal(resolveQuality(low, 'draft', size).iteration.maxIterations, 12);
  assert.equal(scene.iteration.maxIterations, 128);
  assert.throws(() => resolveQuality(scene, 'unknown', size));
});

test('geometry keys identify effective bits and every resolved geometry input, not appearance or target sample count', () => {
  const q = quality(), original = key();
  const appearance = sceneCodec.validate({ ...scene, appearance: { ...scene.appearance, palette: 'rose' } });
  assert.equal(key(appearance), original);
  assert.equal(key(scene, { ...q, sampling: { ...q.sampling, targetSamples: 16 } }), original);
  for (const changed of [
    { ...q, internalSize: { width: 640, height: 360 } },
    { ...q, iteration: { ...q.iteration, maxIterations: 64 } },
    { ...q, tracing: { ...q.tracing, maxSteps: 256 } },
    { ...q, normals: { ...q.normals, epsilonFactor: 0.25 } },
  ]) assert.notEqual(key(scene, changed), original);
  assert.notEqual(key(scene, q, { kernelVersion: 'other' }), original);
  assert.notEqual(key(scene, q, { tracingVersion: 'other' }), original);
  const a = createSpaceScene({ model: 'quaternion-julia' });
  const b = sceneCodec.validate({ ...a, parameters: { ...a.parameters, C: ['-0.20', '0.80', '0.0', '0'] } });
  assert.equal(key(a), key(b), 'requested spelling does not replace effective identity');
  const negativeZero = sceneCodec.validate({ ...a, parameters: { ...a.parameters, kappa: '-0' } });
  assert.notEqual(key(a), key(negativeZero), 'signed zero bits remain inputs');
});

test('appearance, sample and accumulation keys separate lighting and sampling identities', () => {
  const q = quality(), full = appearanceKey(scene, q);
  const direct = appearanceKey(scene, { ...q, lighting: { ...q.lighting, stage: 'direct', shadowRays: 0, shadowSteps: 0, aoSamples: 0 } });
  assert.notEqual(full, direct);
  assert.notEqual(sampleKey(key(), q.sampling, 0), sampleKey(key(), q.sampling, 1));
  assert.notEqual(sampleKey(key(), q.sampling, 1), sampleKey(key(), { ...q.sampling, seed: 9 }, 1));
  assert.notEqual(accumulationKey(key(), full, q.sampling), accumulationKey(key(), direct, q.sampling));
  assert.equal(accumulationKey(key(), full, q.sampling), accumulationKey(key(), full, { ...q.sampling, targetSamples: 64 }));
});

test('Space requests are immutable with distinct runtime execution identities and matching fingerprints', () => {
  const args = { scene, purpose: 'interactive', ...size, profile: 'settled', generation, viewId: 'space', versions };
  const a = createSpaceRequest(args), b = createSpaceRequest(args);
  assert.notEqual(a.requestId, b.requestId); assert.notEqual(a.jobId, b.jobId);
  assert.equal(a.sceneHash, sceneCodec.fingerprint(scene).sceneHash);
  assert.equal(a.keys.geometryKey, key());
  assert.ok(Object.isFrozen(a.quality.lighting)); assert.ok(Object.isFrozen(a.sceneSnapshot.camera));
});

test('the P3 scenes decode through the Space codec and the poses are valid cameras', () => {
  const manifest = JSON.parse(readFileSync(new URL('../reference/performance-workload.json', import.meta.url), 'utf8'));
  let poses = 0;
  for (const item of manifest.scenes) {
    const decoded = sceneCodec.parse(JSON.stringify(item.scene));
    assert.deepEqual(sceneCodec.parse(sceneCodec.serialize(decoded)), decoded);
    assert.deepEqual(decoded.parameters, item.parameters);
    const records = [...manifest.workloads.orbit.cameraPoses[item.id], ...manifest.workloads.interaction.cameraPoses[item.id]];
    for (const { camera } of records) {
      const validated = sceneCodec.validate({ ...decoded, camera });
      // basis() calls B05's private checkCamera; use its real public interface.
      const axes = basis(validated.camera);
      for (const axis of Object.values(axes)) assert.ok(Math.abs(Math.hypot(...axis) - 1) < 1e-12);
      const centre = rayDirection(validated.camera, 639.5, 359.5, 1280, 720);
      centre.forEach((v, i) => assert.ok(Math.abs(v - axes.forward[i]) < 1e-12));
      poses++;
    }
  }
  assert.equal(poses, 3 * (1875 + 400));
});
