// Plan B10: the tracing, normals and pick metadata (passes.js). Node-only (no GPU); the headed
// `rendering` group traces against B04's frozen ray strata and anchors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createAdmission, createPipelineSet, validatePipelineDescriptor, sampleJitter } from '../../src/space/render/backend.js';
import { shaderCode } from '../../src/space/render/webgpu/shaders.js';
import { checkLayoutLimits, packUniforms, SELF_CHECK_PIPELINE_SET } from '../../src/space/render/webgpu/pipelines.js';
import { packStatus, RAY_STATUS, UNRESOLVED_REASON, STAGNATION } from '../../src/space/render/status.js';
import { encodeOrdinaryOrigin, basis, reconstructHit } from '../../src/space/camera.js';
import { escapeRadius, effectiveParameters } from '../../src/space/numerics/parameters.js';
import { createScheduler } from '../../src/shared/scheduler.js';
import { createSpaceScene } from '../../src/space/scene-adapter.js';
import { createSpaceRequest } from '../../src/space/render-adapter.js';
import { createSpaceRenderer } from '../../src/space/render/renderer.js';
import { createFakeClock } from '../support/fake-clock.mjs';
import { createFakeBackend } from '../support/fake-backend.mjs';
import {
  TRACING_VERSION, TRACING_HASHES, TRACING_BINDINGS, TRACE_FIELD_IDS, VALIDATION_FIELD_IDS, TRACE_UNIFORM_LAYOUT,
  tracePipelineDescriptors, tracePipelineSet, validationPipelineDescriptors, traceLayout, traceUniforms, normalsUniforms,
  traceRaysUniforms, encodeRays, decodeRayResults, decodeNormals, resolvePick, TRACE_RAY_BYTES, TRACE_RESULT_BYTES,
  decodeStatusWords, ESTIMATE_DETAIL,
} from '../../src/space/render/webgpu/passes.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const shaderPath = id => new URL(`../../src/space/render/webgpu/shaders/${id}.wgsl`, import.meta.url);
const loadFromDisk = async id => readFileSync(shaderPath(id), 'utf8');
const DEFAULT_LIMITS = { maxStorageBuffersPerShaderStage: 8, maxStorageTexturesPerShaderStage: 4, maxUniformBufferBindingSize: 65536, maxComputeInvocationsPerWorkgroup: 256 };

test('the tracing metadata hashes equal the shader sources on disk and the descriptors validate against the B00 schema', async () => {
  assert.equal(TRACING_VERSION, 'surface-v1/space-trace-v3');
  const descriptors = [...tracePipelineDescriptors(), ...validationPipelineDescriptors()];
  const sources = new Set(descriptors.flatMap(d => d.sourceIds).filter(id => id !== 'fields'));
  assert.deepEqual(Object.keys(TRACING_HASHES.sources).sort(), [...sources].sort());
  for (const id of sources) assert.equal(TRACING_HASHES.sources[id], sha256(readFileSync(shaderPath(id))), `${id}.wgsl changed: run node scripts/shader-metadata.mjs`);
  const assemblies = new Set(descriptors.map(d => d.sourceIds.join('+')));
  assert.deepEqual(Object.keys(TRACING_HASHES.assembled).sort(), [...assemblies].sort());
  for (const descriptor of descriptors) {
    const code = await shaderCode(descriptor.sourceIds, loadFromDisk);
    assert.equal(TRACING_HASHES.assembled[descriptor.sourceIds.join('+')], sha256(code), `${descriptor.pipelineId}: assembled hash`);
    assert.deepEqual(validatePipelineDescriptor(descriptor), descriptor);
    assert.equal(descriptor.kind, 'compute');
    assert.match(code, new RegExp(`@compute @workgroup_size\\(8, 8, 1\\)\\s*\\n\\s*fn ${descriptor.entryPoint}\\(`), `${descriptor.entryPoint} declares the frozen 8×8 ABI`);
    // bindings[i] is @group(0) @binding(i): every slot is declared at its index in the entry source.
    const entrySource = readFileSync(shaderPath(descriptor.sourceIds.at(-1)), 'utf8');
    descriptor.bindings.forEach((binding, index) => {
      const variable = TRACING_BINDINGS.wgsl[descriptor.entryPoint][binding.slot];
      assert.match(entrySource, new RegExp(`@group\\(0\\) @binding\\(${index}\\) var(<[^>]+>)? ${variable}\\b`), `${descriptor.pipelineId}: ${binding.slot} at @binding(${index})`);
    });
  }
  const set = tracePipelineSet();
  assert.deepEqual(createPipelineSet(set), set);
  assert.deepEqual(set.descriptors.map(d => d.pipelineId), [...TRACE_FIELD_IDS.map(id => `trace_band:${id}`), ...TRACE_FIELD_IDS.map(id => `normals_band:${id}`)]);
  // Only the Menger variants bind the box buffer; the slot is recorded in the versioned binding table.
  for (const d of set.descriptors) assert.equal(d.bindings.some(b => b.slot === 'menger_boxes'), d.pipelineId.endsWith(':menger'), d.pipelineId);
  // B11c: trace_band writes the per-pixel quaternion-primary recovery word beside depth and status.
  assert.equal(TRACING_BINDINGS.version, 'space-trace-bindings-v2');
  for (const d of set.descriptors.filter(x => x.entryPoint === 'trace_band')) assert.deepEqual(d.bindings.slice(1, 4).map(b => [b.slot, b.access]), [['depth', 'write'], ['status', 'write'], ['recovery', 'write']], d.pipelineId);
  assert.equal(TRACING_BINDINGS.wgsl.trace_band.recovery, 'recovery_out');
  for (const d of descriptors) assert.deepEqual(TRACING_BINDINGS.descriptors[d.pipelineId], d.bindings.map(b => b.slot), d.pipelineId);
  assert.ok(VALIDATION_FIELD_IDS.includes('constant') && !TRACE_FIELD_IDS.includes('constant'), 'the constant field is validation-only');
  assert.doesNotThrow(() => checkLayoutLimits(createPipelineSet({ id: 'all', descriptors }), DEFAULT_LIMITS));
});

test('trace uniforms pack into each family layout and carry the anchored origin as high and low binary32 parts', () => {
  assert.equal(TRACE_UNIFORM_LAYOUT.byteLength, 160);
  const camera = { kind: 'anchored-perspective-v1', anchor: ['0.1', '0', '0'], scale: { mantissa: 1, exponent: 0 }, positionLocal: [3, -2, 1], focusLocal: [0, 0, 0],
    orientationWxyz: [0.7155417527999327, 0.5366563145999496, 0.2683281572999748, 0.35777087639996635], verticalFovDegrees: 60 };
  const profile = { maxIterations: 128, maxSteps: 512, stepMultiplier: 0.9, toleranceFloor: 1e-6, toleranceFactor: 0.5 };
  const region = { x: 8, y: 16, width: 32, height: 8 };
  const families = { sphere: {}, box: {}, menger: { depth: 2 }, mandelbulb: { power: 8 }, 'quaternion-julia': { C: [-0.2, 0.8, 0, 0].map(Math.fround), kappa: 0 } };
  for (const [modelId, effective] of Object.entries(families)) {
    const uniforms = traceUniforms({ modelId, camera, effective, region, internalSize: { width: 64, height: 36 }, sampling: { seed: 7, sampleIndex: 3 }, profile });
    const layout = traceLayout(modelId);
    assert.deepEqual(Object.keys(uniforms).sort(), layout.fields.map(f => f.name).sort(), modelId);
    assert.equal(packUniforms(layout, uniforms).byteLength, 160);
    const origin = encodeOrdinaryOrigin(camera);
    assert.deepEqual(uniforms.originHigh, origin.highF32); assert.deepEqual(uniforms.originLow, origin.lowF32);
    assert.deepEqual([uniforms.forward, uniforms.right, uniforms.up], Object.values((({ forward, right, up }) => ({ forward, right, up }))(basis(camera))));
    assert.equal(uniforms.alpha, 2 * Math.tan(Math.PI / 6) / 36);
    assert.deepEqual(normalsUniforms({ modelId, camera, effective, region, internalSize: { width: 64, height: 36 }, sampling: { seed: 7, sampleIndex: 3 }, profile }), uniforms);
  }
  const q = traceUniforms({ modelId: 'quaternion-julia', camera, effective: families['quaternion-julia'], region, internalSize: { width: 64, height: 36 }, sampling: { seed: 0, sampleIndex: 0 }, profile });
  assert.equal(q.bound, escapeRadius(families['quaternion-julia'].C).bound, 'the outward-rounded B02 bound');
  assert.throws(() => traceUniforms({ modelId: 'mandelbulb', camera, effective: { power: 9 }, region, internalSize: { width: 64, height: 36 }, sampling: { seed: 0, sampleIndex: 0 }, profile }), RangeError);
  const far = { ...camera, anchor: ['1e300', '0', '0'] };
  assert.throws(() => traceUniforms({ modelId: 'sphere', camera: far, effective: {}, region, internalSize: { width: 64, height: 36 }, sampling: { seed: 0, sampleIndex: 0 }, profile }), /origin-out-of-range/);
});

test('validation rays encode as high/low/direction/interval records and results decode the packed status', () => {
  const rays = [{ origin: [0.1, -4, 1e-9], direction: [0, 1, 0] }, { origin: [1, 0, 0], direction: [1, 0, 0], interval: { enter: 2 ** -26, exit: 2 } }];
  const bytes = encodeRays(rays);
  assert.equal(bytes.byteLength, 2 * TRACE_RAY_BYTES);
  const f = new Float32Array(bytes.buffer);
  assert.equal(f[0], Math.fround(0.1)); assert.equal(f[4], Math.fround(0.1 - Math.fround(0.1)));
  assert.equal(f[3], 0); assert.equal(f[16 + 3], 1, 'explicit interval flag');
  assert.deepEqual([f[16 + 12], f[16 + 13]], [2 ** -26, 2]);
  const words = new Uint32Array(8), view = new DataView(words.buffer);
  words[0] = packStatus({ status: RAY_STATUS.unresolved, reason: UNRESOLVED_REASON.stagnation, subreason: STAGNATION.fieldCoordinate, steps: 1 });
  view.setFloat32(4, 1.5, true); words[2] = 0;
  words[4] = packStatus({ status: RAY_STATUS.unresolved, reason: UNRESOLVED_REASON.estimateUnavailable, subreason: 0, steps: 1 }); words[6] = 1;
  const decoded = decodeRayResults(new Uint8Array(words.buffer), 2);
  assert.deepEqual(decoded[0], { status: 'unresolved', reason: 'stagnation', subreason: 'field-coordinate', steps: 1, t: 1.5, detail: null,
    recovery: { attempted: false, outcome: 'none', stop: 'none', midpoints: 0, encounters: 0 } });
  assert.equal(decoded[1].reason, 'estimate-unavailable'); assert.equal(decoded[1].subreason, null); assert.equal(decoded[1].detail, 'interior');
  assert.equal(TRACE_RESULT_BYTES, 16);
  const u = traceRaysUniforms({ modelId: 'constant', effective: { distance: 2 ** -30 }, count: 2, pitch: 2, profile: { maxIterations: 128, maxSteps: 512, stepMultiplier: 0.9, toleranceFloor: 0, toleranceFactor: 0, alpha: 0 } });
  assert.deepEqual(u.C, [2 ** -30, 0, 0, 0]); assert.deepEqual(u.size, [2, 1]);
  // rgba16float normals: w = availability (B09 counts (half & 0x7fff) === 0 as unavailable).
  const halves = new Uint16Array([0x3c00, 0, 0, 0x3c00, 0, 0, 0, 0]);
  assert.deepEqual(decodeNormals(new Uint8Array(halves.buffer), 2), [{ available: true, normal: [1, 0, 0] }, { available: false, normal: [0, 0, 0] }]);
});

test('a pick reconstructs the anchored hit from its sample, and a precision-limit reconstruction is an unresolved pick', () => {
  const camera = { kind: 'anchored-perspective-v1', anchor: ['0', '0', '0'], scale: { mantissa: 1, exponent: 0 }, positionLocal: [0, -5, 0], focusLocal: [0, 0, 0],
    orientationWxyz: [Math.SQRT1_2, Math.SQRT1_2, 0, 0], verticalFovDegrees: 60 };
  const sample = { camera, pixel: [32, 18], jitter: sampleJitter({ seed: 1, sampleIndex: 0, pixel: [32, 18] }), dimensions: { width: 64, height: 36 } };
  const hit = resolvePick({ status: 'approximate hit', depth: 4, sample });
  assert.equal(hit.status, 'resolved');
  assert.deepEqual(hit.point, reconstructHit(camera, [32, 18], sample.jitter, 4, 64, 36));
  assert.deepEqual(resolvePick({ status: 'miss', depth: 0, sample }), { status: 'unresolved', reason: 'no-hit', rayStatus: 'miss' });
  assert.deepEqual(resolvePick({ stale: true }), { status: 'stale' });
  const tiny = { ...camera, scale: { mantissa: 1, exponent: -1074 } };
  assert.deepEqual(resolvePick({ status: 'approximate hit', depth: 1e300, sample: { ...sample, camera: tiny } }), { status: 'unresolved', reason: 'precision-limit', rayStatus: 'approximate hit' });
});

// The renderer (B09) builds tracing uniforms from its own dictionary. This drives the real tracing
// descriptors through B09's pass sequence on the fake backend and checks every trace and normals batch
// carries exactly traceUniforms(...) for its region (so no product uniform is missing at run time).
test('the renderer drives the tracing descriptors through the B09 pass sequence with the tracing uniforms', async () => {
  const fixture = (id, entry, bindings) => ({ pipelineId: id, kind: 'compute', sourceIds: ['fixture-only'], entryPoint: entry, constants: {},
    bindings: [{ slot: 'u', type: 'uniform-buffer', access: 'read' }, ...bindings], uniformLayout: { byteLength: 16, fields: [{ name: 'origin', type: 'vec2<u32>', offset: 0 }, { name: 'size', type: 'vec2<u32>', offset: 8 }] } });
  const read = slot => ({ slot, type: 'texture', access: 'read' }), write = slot => ({ slot, type: 'storage-texture', access: 'write' });
  const selfCheck = SELF_CHECK_PIPELINE_SET.descriptors.filter(d => ['probe', 'present'].includes(d.pipelineId));
  const pipelineSet = createPipelineSet({ id: 'b10-renderer', descriptors: [...selfCheck, ...tracePipelineDescriptors().filter(d => !d.pipelineId.endsWith(':menger')),
    fixture('shade', 'shade_band', [read('status'), read('normal'), write('sampleColor'), write('lightingStatus')]),
    fixture('accumulate', 'accumulate_band', [read('sampleColor'), write('next')]), fixture('display', 'display_band', [read('accumulation'), write('display')])] });
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  for (const model of ['sphere', 'mandelbulb', 'quaternion-julia']) {
    const clock = createFakeClock(), fake = createFakeBackend({ clock });
    const batches = [], tickets = [];
    const track = (method, desc, options) => { const ticket = fake[method](desc, options); const item = { ticket, pending: true }; tickets.push(item); ticket.done.then(() => { item.pending = false; }); return ticket; };
    const backend = { ...fake,
      submitBatch(batch, options) { batches.push(batch); return track('submitBatch', batch, options); },
      readback(desc, options) { if (desc.fields.includes('probe')) fake.stage(desc.source, new Uint8Array(Uint32Array.of(0x41544c53).buffer)); return track('readback', desc, options); },
      present(desc, options) { return track('present', desc, options); } };
    const scheduler = createScheduler({ clock, makeAdmission: createAdmission, setTimer: clock.schedule, clearTimer: clock.clear });
    const versions = { kernelVersion: 'space-fields-v1', tracingVersion: TRACING_VERSION };
    const renderer = createSpaceRenderer({ backend, scheduler, clock, viewId: 'space', versions, pipelineSet });
    const until = async predicate => {
      for (let i = 0; i < 5000; i++) {
        await flush(); if (predicate()) return;
        const item = tickets.find(entry => entry.pending); if (item) { clock.advance(0.1); fake.complete(item.ticket, { elapsedMs: 8 }); }
      }
      assert.fail(`${model}: the bounded fake-backend driver did not reach its condition`);
    };
    let prepared, failure;
    renderer.prepare().then(value => { prepared = value; }, error => { failure = error; }); await flush(); fake.finishPrepare();
    await until(() => prepared !== undefined || failure !== undefined);
    assert.equal(failure, undefined, `${model}: preparation ${failure?.message}`);
    const scene = createSpaceScene({ model });
    const request = createSpaceRequest({ scene, purpose: 'interactive', width: 16, height: 8, profile: 'draft', generation: { deviceEpoch: fake.currentEpoch(), viewRevision: 1, geometryRevision: 1, appearanceRevision: 1 }, viewId: 'space', versions });
    let result; renderer.render(request).done.then(value => { result = value; });
    await until(() => result !== undefined);
    assert.equal(result.outcome, 'completed', `${model}: ${result.reason}`);
    const traced = batches.filter(b => b.pass === 'trace' || b.pass === 'normals');
    assert.ok(traced.some(b => b.pass === 'trace') && traced.some(b => b.pass === 'normals'), `${model}: trace and normals batches were submitted`);
    const { effective } = effectiveParameters(model, scene.parameters);
    for (const batch of traced) {
      assert.equal(batch.pipelineId, `${batch.pass}_band:${model}`);
      const expected = traceUniforms({ modelId: model, camera: scene.camera, effective, region: batch.region, internalSize: request.quality.internalSize,
        sampling: { seed: request.quality.sampling.seed, sampleIndex: batch.sample.index }, profile: { ...request.quality.iteration, ...request.quality.tracing } });
      assert.deepEqual(batch.uniforms, expected, `${model} ${batch.pass} uniforms`);
    }
    renderer.destroy();
  }
});

test('every dangerous tracing WGSL operation carries a guard annotation (source audit only)', () => {
  for (const id of Object.keys(TRACING_HASHES.sources)) {
    const lines = readFileSync(shaderPath(id), 'utf8').split('\n');
    lines.forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, '');
      const dangerous = /\b(log|log2|sqrt|exp2|normalize)\s*\(/.test(code) || /[^/*]\/[^/*=]/.test(code);
      if (!dangerous || /^\s*fn /.test(code)) return;
      assert.match(lines[index - 1] ?? '', /\/\/ guard:/, `${id}.wgsl:${index + 1} lacks a preceding // guard: annotation: ${line.trim()}`);
    });
  }
});

// ---- fix round 1 (Codex run 20261021T203032Z-7350) ----
import { enclosingSphere, enclosingBox, advance, f32Context } from '../support/trace-f32.mjs';
const F1_RAY = { high: [50361504, 29461416, -83167144], low: [0, 0, 0], d: [-0.49572083353996277, -0.28999605774879456, 0.8186349272727966] };

test('B10-F1: a far origin whose binary32 field inputs reach the volume is never an empty interval', () => {
  const c = f32Context();
  assert.equal(c.dot(F1_RAY.d, F1_RAY.d), 1, 'binary32 dot(d, d) = 1 (Codex counterexample)');
  assert.deepEqual(c.position(F1_RAY.high, F1_RAY.low, F1_RAY.d, 101592472), [0, 0, 0], 'the unfused field input at t = 101592472 is the origin');
  const interval = enclosingSphere(F1_RAY.high, F1_RAY.low, F1_RAY.d, 2);
  assert.equal(interval.overflow, false);
  assert.equal(interval.kind, 0, 'an intersecting ray is not classed as a miss');
  assert.ok(interval.enter <= 101592472 && interval.exit >= 101592472, `[${interval.enter}, ${interval.exit}] contains the field input inside the volume`);
});

test('B10-F2: the step-advance guard and the slab quotients never overflow binary32', () => {
  const step = advance(2, 1, Math.fround(0.9));
  assert.equal(step.overflow, false, 'ordinary t = 2 must not overflow inside its own guard');
  assert.equal(step.failure, false); assert.equal(step.candidate, Math.fround(2 + Math.fround(0.9)));
  const huge = advance(Math.fround(2 ** 100), Math.fround(2 ** 126), Math.fround(0.9));
  assert.equal(huge.overflow, false); assert.equal(huge.failure, true, 'an unreachable advance is a numerical failure');
  const slab = enclosingBox([8, -4, 0], [0, 0, 0], [2 ** -126, 1, 0]);
  assert.equal(slab.overflow, false, 'a normal but tiny direction component must not overflow the slab quotients');
  assert.ok(slab.kind === 1 || slab.enter >= 2 ** 74, 'x = 8 never reaches the box within reachable parameters');
});

test('B10-F3: the interior detail rides a reason-dependent subreason code in the B00 status word', () => {
  const word = packStatus({ status: RAY_STATUS.unresolved, reason: UNRESOLVED_REASON.estimateUnavailable, subreason: 1, steps: 1 });
  assert.deepEqual(decodeStatusWords(new Uint8Array(Uint32Array.of(word).buffer))[0], { status: 'unresolved', reason: 'estimate-unavailable', subreason: null, detail: 'interior', steps: 1 });
  const stagnation = packStatus({ status: RAY_STATUS.unresolved, reason: UNRESOLVED_REASON.stagnation, subreason: 1, steps: 3 });
  assert.deepEqual(decodeStatusWords(new Uint8Array(Uint32Array.of(stagnation).buffer))[0], { status: 'unresolved', reason: 'stagnation', subreason: 'ray-parameter', detail: null, steps: 3 });
  assert.equal(ESTIMATE_DETAIL.interior, 1);
});

test('B10-F1: a seeded sweep of far origins never excludes a binary32 field input inside the volume', () => {
  let seed = 12345; const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32;
  let checked = 0, inside = 0;
  for (let n = 0; n < 4000; n++) {
    const scale = 2 ** (4 + 36 * rand()), dir = [rand() - 0.5, rand() - 0.5, rand() - 0.5], len = Math.hypot(...dir);
    const high = dir.map(v => Math.fround(-scale * v / len)), aim = [rand() - 0.5, rand() - 0.5, rand() - 0.5].map(v => v * 3);
    const raw = aim.map((a, i) => a - high[i]), rl = Math.hypot(...raw), d = raw.map(v => Math.fround(v / rl));
    const radius = 2, interval = enclosingSphere(high, [0, 0, 0], d, radius), c = f32Context();
    assert.equal(interval.overflow, false);
    for (let k = -64; k <= 64; k++) {
      const t = Math.fround(rl + k * (scale * 2 ** -20 + 0.05)), p = c.position(high, [0, 0, 0], d, t);
      if (Math.hypot(...p) > radius) continue;
      inside++;
      assert.ok(interval.kind === 0 && interval.enter <= t && t <= interval.exit, `ray ${n} (scale 2^${Math.log2(scale).toFixed(1)}): field input at t=${t} lies inside but [${interval.enter}, ${interval.exit}] kind ${interval.kind}`);
    }
    checked++;
  }
  assert.ok(checked === 4000 && inside > 1000, `${inside} inside field inputs checked`);
});

test('B10-F1/F2: the binary32 mirror follows trace.wgsl\'s expressions', () => {
  const source = readFileSync(shaderPath('trace'), 'utf8');
  for (const line of ['const ROUNDING_MARGIN: f32 = 0.00000762939453125;', 'const T_REACH: f32 = 1267650600228229401496703205376.0;',
    'let margin = VOLUME_INFLATION * radius + (abs(low.x) + abs(low.y) + abs(low.z)) + ROUNDING_MARGIN * (extent + radius);',
    'let disc = dd * (r * r) - dot(perpendicular, perpendicular);', 'let half_chord = sqrt(disc) / dd;', 'let mid = -dot(high, d) / dd;',
    'if (abs(n) >= abs(d) * T_REACH) { return select(-T_REACH, T_REACH, (n > 0.0) == (d > 0.0)); }',
    'let advance = u.step_multiplier * distance;', 'if (!(advance <= F32_MAX - t)) { return ray_failure(steps, t); }', 'if (candidate > T_REACH) { return ray_failure(steps, t); }',
    `const ESTIMATE_DETAIL_INTERIOR: u32 = ${ESTIMATE_DETAIL.interior}u;`]) assert.ok(source.includes(line), `trace.wgsl contains: ${line}`);
  assert.ok(!/REORIGIN|t0 \* d/.test(source), 'no rebased origin');
});
