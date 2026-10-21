// Plan B08: the field kernels' JavaScript metadata, point-batch admission and the PointResult ABI.
// Node-only (no GPU); the headed numerics group compares the kernels against B04's frozen matrix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createPipelineSet, validatePipelineDescriptor } from '../../src/space/render/backend.js';
import { shaderCode } from '../../src/space/render/webgpu/shaders.js';
import { checkLayoutLimits } from '../../src/space/render/webgpu/pipelines.js';
import { POINT_STATUS } from '../../src/space/render/status.js';
import {
  KERNEL_VERSION, KERNEL_HASHES, KERNEL_FORMULATION, FIELD_IDS, KERNEL_SOURCE_IDS, fieldPipelineDescriptors, fieldPipelineSet,
  admitPointModel, encodePoints, encodeRawPoints, pointRegion, pointUniforms, decodePointResults, mengerBoxData, encodeDerivativeProbes,
  POINT_INPUT_BYTES, POINT_RESULT_BYTES, RESULT_SENTINEL, POINT_UNIFORM_LAYOUT,
} from '../../src/space/render/webgpu/kernels.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const shaderPath = id => new URL(`../../src/space/render/webgpu/shaders/${id}.wgsl`, import.meta.url);
const loadFromDisk = async id => readFileSync(shaderPath(id), 'utf8');

test('the kernel metadata hashes equal the shader sources on disk and the descriptors validate against the B00 schema', async () => {
  assert.equal(KERNEL_VERSION, 'space-fields-v1');
  assert.deepEqual(Object.keys(KERNEL_HASHES.sources).sort(), [...KERNEL_SOURCE_IDS].sort());
  for (const id of KERNEL_SOURCE_IDS) assert.equal(KERNEL_HASHES.sources[id], sha256(readFileSync(shaderPath(id))), `${id}.wgsl changed: run node scripts/shader-metadata.mjs`);
  const descriptors = fieldPipelineDescriptors();
  const assemblies = new Set(descriptors.map(d => d.sourceIds.join('+')));
  assert.deepEqual(Object.keys(KERNEL_HASHES.assembled).sort(), [...assemblies].sort());
  for (const descriptor of descriptors) {
    // Exactly what B06 executes: wgslConstants() + '\n' + the sources joined by '\n'.
    const code = await shaderCode(descriptor.sourceIds, loadFromDisk);
    assert.equal(KERNEL_HASHES.assembled[descriptor.sourceIds.join('+')], sha256(code), `${descriptor.pipelineId}: assembled hash`);
    assert.deepEqual(validatePipelineDescriptor(descriptor), descriptor);
    assert.equal(descriptor.kind, 'compute');
    assert.ok(descriptor.bindings.every(binding => binding.type !== 'storage-texture'), 'point kernels use no storage textures');
    const entry = new RegExp(`@compute @workgroup_size\\(8, 8, 1\\)\\s*\\n\\s*fn ${descriptor.entryPoint}\\(`);
    assert.match(code, entry, `${descriptor.entryPoint} must declare the frozen 8×8 dispatch ABI`);
  }
  const set = fieldPipelineSet();
  assert.deepEqual(createPipelineSet(set), set);
  assert.equal(set.id, KERNEL_VERSION);
  assert.deepEqual(set.descriptors.map(d => d.pipelineId), [...FIELD_IDS.map(id => `points-${id}`), 'points-derivative']);
  assert.deepEqual(set.descriptors.filter(d => d.entryPoint === 'evaluate_points').map(d => d.constants.FIELD), FIELD_IDS.map((_, i) => i));
  // Default WebGPU limits suffice (no requiredLimits; rev 4.4 ruling (a)).
  assert.doesNotThrow(() => checkLayoutLimits(set, { maxStorageBuffersPerShaderStage: 8, maxStorageTexturesPerShaderStage: 4, maxUniformBufferBindingSize: 65536, maxComputeInvocationsPerWorkgroup: 256 }));
  assert.equal(POINT_UNIFORM_LAYOUT.byteLength % 16, 0);
});

test('the quaternion kernel cites the G5-D formulation and the product kernel is identified separately', () => {
  const decision = JSON.parse(readFileSync(new URL('../../docs/reports/project0/webgpu-g5d-decision.json', import.meta.url), 'utf8'));
  assert.equal(KERNEL_FORMULATION.form, decision.kernel.form);
  assert.equal(KERNEL_FORMULATION.fragmentSha256, decision.kernel.fragmentSha256);
  assert.equal(KERNEL_FORMULATION.profile, 'project0-g5d-v1');
  assert.ok(KERNEL_FORMULATION.fragmentSha256.startsWith('290b4cc6'));
  assert.notEqual(KERNEL_FORMULATION.form, KERNEL_VERSION);
  const fields = readFileSync(shaderPath('fields'), 'utf8');
  // The plain polynomial, left to right, then + C: no compensation, no projection into the slice.
  assert.match(fields, /q\.x \* q\.x - q\.y \* q\.y - q\.z \* q\.z - q\.w \* q\.w, 2\.0 \* q\.x \* q\.y, 2\.0 \* q\.x \* q\.z, 2\.0 \* q\.x \* q\.w\) \+ c/);
});

test('every dangerous WGSL operation carries a guard annotation (source audit only)', () => {
  for (const id of KERNEL_SOURCE_IDS) {
    const lines = readFileSync(shaderPath(id), 'utf8').split('\n');
    lines.forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, '');
      const dangerous = /\b(acos|log|log2|sqrt|atan2|derivative_update)\s*\(/.test(code) || /[^/*]\/[^/*=]/.test(code);
      if (!dangerous || /^\s*fn /.test(code)) return;
      assert.match(lines[index - 1] ?? '', /\/\/ guard:/, `${id}.wgsl:${index + 1} lacks a preceding // guard: annotation: ${line.trim()}`);
    });
  }
});

test('point admission refuses invalid inputs before any dispatch', () => {
  assert.throws(() => admitPointModel('mandelbulb', { power: 9 }, 128), RangeError);
  assert.throws(() => admitPointModel('mandelbulb', { power: 8 }, 0), RangeError);
  assert.throws(() => admitPointModel('mandelbulb', { power: 8 }, 513), RangeError);
  assert.throws(() => admitPointModel('quaternion-julia', { C: [4.5, 0, 0, 0], kappa: 0 }, 128), RangeError);
  assert.throws(() => admitPointModel('quaternion-julia', { C: [0.1, 0, 0, 0], kappa: 0 }, 128), RangeError, 'C must be effective binary32');
  assert.throws(() => admitPointModel('menger', { depth: 3 }, 1), RangeError);
  assert.throws(() => admitPointModel('torus', {}, 1), RangeError);
  assert.throws(() => encodePoints([[0, Number.NaN, 0]]), RangeError);
  assert.throws(() => encodePoints([[0, Number.POSITIVE_INFINITY, 0]]), RangeError);
  assert.throws(() => encodePoints([[0.1, 0, 0]]), RangeError, 'points must be effective binary32');
  const q = admitPointModel('quaternion-julia', { C: [Math.fround(-0.2), Math.fround(0.8), 0, 0], kappa: 4 }, 64);
  assert.equal(q.field, FIELD_IDS.indexOf('quaternion-julia'));
  assert.equal(q.bound, 2); assert.equal(q.emptySlice, true);
  const b = admitPointModel('mandelbulb', { power: 7 }, 512);
  assert.deepEqual([b.field, b.power, b.cap, b.emptySlice], [FIELD_IDS.indexOf('mandelbulb'), 7, 512, false]);
  // The raw encoder exists only to exercise the GPU guards with non-finite bit patterns.
  const raw = new DataView(encodeRawPoints([[Number.NaN, 0, 0]]).buffer);
  assert.ok(Number.isNaN(raw.getFloat32(0, true)));
});

test('point regions, uniforms and the PointResult layout round-trip', () => {
  assert.equal(POINT_INPUT_BYTES, 16); assert.equal(POINT_RESULT_BYTES, 64);
  const region = pointRegion({ first: 512, count: 600, pitch: 256 });
  assert.deepEqual(region, { x: 0, y: 2, width: 256, height: 3 });
  const model = admitPointModel('quaternion-julia', { C: [Math.fround(-0.2), Math.fround(0.8), 0, 0], kappa: 0.5 }, 128);
  const uniforms = pointUniforms(model, { first: 512, count: 600, pitch: 256 });
  assert.deepEqual(Object.keys(uniforms).sort(), POINT_UNIFORM_LAYOUT.fields.map(f => f.name).sort());
  assert.deepEqual([uniforms.origin, uniforms.size, uniforms.end, uniforms.pitch, uniforms.cap], [[0, 2], [256, 3], 1112, 256, 128]);
  const encoded = encodePoints([[1, -2, 0.5], [0, 0, 0]]);
  assert.equal(encoded.byteLength, 32);
  assert.deepEqual([...new Float32Array(encoded.buffer)], [1, -2, 0.5, 0, 0, 0, 0, 0], 'kappa travels in the uniforms, never per point');
  const bytes = new ArrayBuffer(3 * POINT_RESULT_BYTES), u32 = new Uint32Array(bytes), f32 = new Float32Array(bytes), i32 = new Int32Array(bytes);
  // case 0: escaped at 3 with an estimate; case 1: not escaped; case 2: the unwritten sentinel.
  u32.set([POINT_STATUS.escaped, 3, 0, 0], 0); f32.set([0, 0, 257, 0, Math.fround(Math.log(257)), -3.5, 1.125], 4); i32[11] = 13;
  u32.set([POINT_STATUS.notEscaped, 128, 1, 0], 16); f32.set([0, 0, 0, 0, 0, 0, 1], 20); i32[27] = 0;
  u32.fill(RESULT_SENTINEL, 32, 48);
  const [escaped, bounded, missing] = decodePointResults(new Uint8Array(bytes), 3, 'mandelbulb');
  assert.equal(escaped.status, 'escaped'); assert.equal(escaped.escapeIndex, 3); assert.deepEqual(escaped.value, [0, 0, 257]);
  assert.equal(escaped.estimateAvailable, true); assert.equal(escaped.log2DE, -3.5);
  assert.deepEqual(escaped.derivative, { zero: false, mantissa: 1.125, exponent: 13 });
  assert.equal(bounded.status, 'not escaped within iteration budget'); assert.equal(bounded.escapeIndex, null);
  assert.equal(bounded.logEscapeRadius, null); assert.equal(bounded.log2DE, null); assert.equal(bounded.estimateAvailable, false);
  assert.equal(missing.status, 'missing', 'an unwritten result is never decoded as a status');
});

test('Menger boxes share bit-identical lattice faces and derivative probes encode their recurrence', () => {
  for (const [depth, count] of [[1, 20], [2, 400]]) {
    const data = new Float32Array(mengerBoxData(depth).buffer);
    assert.equal(data.length, count * 8);
    const faces = new Set(Array.from({ length: 3 ** depth + 1 }, (_, k) => Math.fround((2 * k - 3 ** depth) / 3 ** depth)));
    for (let i = 0; i < count; i++) for (const offset of [0, 1, 2, 4, 5, 6]) assert.ok(faces.has(data[8 * i + offset]), `box ${i} face`);
  }
  const probes = new Float32Array(encodeDerivativeProbes([{ grow: 8, add: 1, updates: 44 }]).buffer);
  assert.deepEqual([...probes], [8, 1, 44, 0]);
  assert.throws(() => encodeDerivativeProbes([{ grow: 8, add: 2, updates: 44 }]), RangeError);
  assert.throws(() => encodeDerivativeProbes([{ grow: 8, add: 1, updates: 513 }]), RangeError);
});
