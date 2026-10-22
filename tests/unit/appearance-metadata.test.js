// Plan B11 (spec §8.1 steps 4–6, §8.2, §7.6, §9.1 "Pipelines"/"Pipeline descriptors"): the appearance
// metadata (appearance.js), its descriptors through the B09 renderer, the legend and display rules as a
// CPU reference, and the Menger box buffer. Node-only (no GPU); the headed `rendering` group executes them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createAdmission, createPipelineSet, validatePipelineDescriptor } from '../../src/space/render/backend.js';
import { shaderCode } from '../../src/space/render/webgpu/shaders.js';
import { checkLayoutLimits, packUniforms, SELF_CHECK_PIPELINE_SET } from '../../src/space/render/webgpu/pipelines.js';
import { LEGEND, packStatus, packLightingStatus, RAY_STATUS, UNRESOLVED_REASON, STAGNATION } from '../../src/space/render/status.js';
import { effectiveParameters } from '../../src/space/numerics/parameters.js';
import { createScheduler } from '../../src/shared/scheduler.js';
import { createSpaceScene, sceneCodec, VIEW_MODES } from '../../src/space/scene-adapter.js';
import { createSpaceRequest } from '../../src/space/render-adapter.js';
import { createSpaceRenderer } from '../../src/space/render/renderer.js';
import { tracePipelineDescriptors, TRACING_VERSION, TRACE_FIELD_IDS } from '../../src/space/render/webgpu/passes.js';
import { fieldPipelineDescriptors, mengerBoxData } from '../../src/space/render/webgpu/kernels.js';
import { createFakeClock } from '../support/fake-clock.mjs';
import { createFakeBackend } from '../support/fake-backend.mjs';
import {
  APPEARANCE_VERSION, APPEARANCE_HASHES, APPEARANCE_BINDINGS, DIAGNOSTIC_MODES, VIEW_MODE_CODES, VIEW_MODE_LABELS, LIGHTING_STAGE_CODES,
  ACCUMULATION_FLAGS, TERMINATION_COLOURS, legendBytes, srgbEncode, sampleFlags, displayLegend, expectedDisplay, LIGHTING_TINT,
  appearancePipelineDescriptors, appearancePipelineSet, productPipelineDescriptors, productPipelineSet, PRODUCT_PIPELINE_SET_ID,
  shadeUniforms, diagnosticUniforms, accumulateUniforms, displayUniforms, verifyPrewarm, appearanceImplementationHashes,
} from '../../src/space/render/webgpu/appearance.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const shaderPath = id => new URL(`../../src/space/render/webgpu/shaders/${id}.wgsl`, import.meta.url);
const loadFromDisk = async id => readFileSync(shaderPath(id), 'utf8');
const DEFAULT_LIMITS = { maxStorageBuffersPerShaderStage: 8, maxStorageTexturesPerShaderStage: 4, maxUniformBufferBindingSize: 65536, maxComputeInvocationsPerWorkgroup: 256 };

test('the appearance metadata hashes equal the sources and verifyPrewarm reports a missing variant', async () => {
  assert.equal(APPEARANCE_VERSION, 'space-appearance-v3');
  assert.equal(PRODUCT_PIPELINE_SET_ID, 'space-product-v3');
  const descriptors = appearancePipelineDescriptors();
  const owned = new Set(descriptors.flatMap(d => d.sourceIds).filter(id => !['fields', 'trace', 'menger-sample', 'menger-absent'].includes(id)));
  assert.deepEqual([...owned].sort(), ['accumulate', 'display', 'shade']);
  assert.deepEqual(Object.keys(APPEARANCE_HASHES.sources).sort(), [...owned].sort());
  for (const id of owned) assert.equal(APPEARANCE_HASHES.sources[id], sha256(readFileSync(shaderPath(id))), `${id}.wgsl changed: run node scripts/shader-metadata.mjs`);
  assert.deepEqual(Object.keys(APPEARANCE_HASHES.assembled).sort(), [...new Set(descriptors.map(d => d.sourceIds.join('+')))].sort());
  for (const descriptor of descriptors) {
    const code = await shaderCode(descriptor.sourceIds, loadFromDisk);
    assert.equal(APPEARANCE_HASHES.assembled[descriptor.sourceIds.join('+')], sha256(code), `${descriptor.pipelineId}: assembled hash`);
  }
  const hashes = appearanceImplementationHashes();
  assert.equal(hashes.appearanceVersion, APPEARANCE_VERSION);
  for (const [id, hash] of Object.entries(APPEARANCE_HASHES.sources)) assert.equal(hashes[`${id}.wgsl`], hash);

  // The complete product set: every pipeline the B09 renderer looks up for every model and view mode.
  const product = productPipelineSet(), ids = product.descriptors.map(d => d.pipelineId);
  assert.equal(product.id, PRODUCT_PIPELINE_SET_ID);
  assert.deepEqual(createPipelineSet(product), product);
  const required = ['probe', 'present', 'accumulate_band', 'display_band', ...TRACE_FIELD_IDS.flatMap(model => [`points-${model}`, `trace_band:${model}`,
    `normals_band:${model}`, `shade_band:${model}`, `diagnostic_depth:${model}`]), ...['normals', 'steps', 'termination'].map(mode => `diagnostic_${mode}`)];
  assert.deepEqual([...ids].sort(), [...required].sort());
  assert.equal(new Set(ids).size, ids.length);
  assert.doesNotThrow(() => checkLayoutLimits(product, DEFAULT_LIMITS));
  assert.deepEqual(productPipelineDescriptors().map(d => d.pipelineId), ids);
  for (const id of tracePipelineDescriptors().map(d => d.pipelineId)) assert.ok(ids.includes(id));
  for (const id of fieldPipelineDescriptors().filter(d => d.entryPoint === 'evaluate_points').map(d => d.pipelineId)) assert.ok(ids.includes(id));
  assert.ok(!ids.includes('selfcheck-trace') && !ids.includes('probe-display') && !ids.includes('points-derivative'), 'validation pipelines are not product pipelines');

  // verifyPrewarm compares identifiers only; GPU objects stay inside the backend.
  assert.deepEqual(verifyPrewarm({ requiredPipelineIds: ids, preparedPipelineIds: [...ids].reverse() }), { ok: true, missing: [] });
  assert.deepEqual(verifyPrewarm({ requiredPipelineIds: ids, preparedPipelineIds: ids.filter(id => id !== 'shade_band:menger') }), { ok: false, missing: ['shade_band:menger'] });
  assert.deepEqual(verifyPrewarm({ requiredPipelineIds: ['a', 'b', 'c'], preparedPipelineIds: ['b'] }), { ok: false, missing: ['a', 'c'] });
  assert.ok(Object.isFrozen(verifyPrewarm({ requiredPipelineIds: ['a'], preparedPipelineIds: ['a'] })));
  for (const bad of [{}, { requiredPipelineIds: 'a', preparedPipelineIds: [] }, { requiredPipelineIds: [], preparedPipelineIds: [{}] }, { requiredPipelineIds: [''], preparedPipelineIds: [] }])
    assert.throws(() => verifyPrewarm(bad), TypeError);
});

test('the appearance descriptors bind every slot at its WGSL index under the frozen ABI and the storage-texture limit', async () => {
  const descriptors = appearancePipelineDescriptors();
  assert.deepEqual(createPipelineSet(appearancePipelineSet()), appearancePipelineSet());
  assert.deepEqual(descriptors.map(d => d.pipelineId), [...TRACE_FIELD_IDS.map(m => `shade_band:${m}`), ...TRACE_FIELD_IDS.map(m => `diagnostic_depth:${m}`),
    'diagnostic_normals', 'diagnostic_steps', 'diagnostic_termination', 'accumulate_band', 'display_band']);
  assert.equal(APPEARANCE_BINDINGS.version, 'space-appearance-bindings-v1');
  for (const descriptor of descriptors) {
    assert.deepEqual(validatePipelineDescriptor(descriptor), descriptor);
    const code = await shaderCode(descriptor.sourceIds, loadFromDisk);
    assert.match(code, new RegExp(`@compute @workgroup_size\\(8, 8, 1\\)\\s*\\n\\s*fn ${descriptor.entryPoint}\\(`), `${descriptor.entryPoint}: the frozen 8×8 ABI`);
    const entrySource = readFileSync(shaderPath(descriptor.sourceIds.at(-1)), 'utf8');
    descriptor.bindings.forEach((binding, index) => {
      const variable = APPEARANCE_BINDINGS.wgsl[descriptor.sourceIds.at(-1)][binding.slot];
      assert.ok(variable, `${descriptor.pipelineId}: ${binding.slot} is in the binding table`);
      assert.match(entrySource, new RegExp(`@group\\(0\\) @binding\\(${index}\\) var(<[^>]+>)? ${variable}\\b`), `${descriptor.pipelineId}: ${binding.slot} at @binding(${index})`);
    });
    assert.deepEqual(APPEARANCE_BINDINGS.descriptors[descriptor.pipelineId], descriptor.bindings.map(b => b.slot));
    assert.ok(descriptor.bindings.filter(b => b.type === 'storage-texture').length <= 4, `${descriptor.pipelineId}: storage textures within the default limit`);
    // Only the Menger shading variant statically evaluates the field, so only it binds the box buffer.
    assert.equal(descriptor.bindings.some(b => b.slot === 'menger_boxes'), descriptor.pipelineId === 'shade_band:menger', descriptor.pipelineId);
  }
  // The renderer's alias names (renderer.js batch()) are the only slots used.
  const aliases = new Set(['u', 'depth', 'status', 'normal', 'sampleColor', 'lightingStatus', 'accumulationFlags', 'previous', 'next', 'accumulation', 'display', 'menger_boxes']);
  for (const d of descriptors) for (const b of d.bindings) assert.ok(aliases.has(b.slot), `${d.pipelineId}: ${b.slot}`);
  const flags = descriptors.find(d => d.pipelineId === 'accumulate_band').bindings.find(b => b.slot === 'accumulationFlags');
  assert.deepEqual(flags, { slot: 'accumulationFlags', type: 'storage-texture', access: 'read-write' });
});

// Rev 5.1 (B11c FU1, user-approved 2026-10-22): AO heights h_i = 4i·τ(t), i = 1..5; the 0.015·t term is removed.
// The kernel is the only implementation, so its source is checked: one spacing of SECONDARY_OFFSET·τ, no t-scaled term.
test('AO sample heights are 4i·tau(t) with no t-proportional reach (space-appearance-v3)', () => {
  const shade = readFileSync(shaderPath('shade'), 'utf8'), code = shade.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
  assert.equal(APPEARANCE_VERSION, 'space-appearance-v3');
  assert.match(code, /const SECONDARY_OFFSET: f32 = 4\.0;/);
  assert.match(code, /const AO_MAX_SAMPLES: u32 = 5u;/);
  assert.doesNotMatch(code, /AO_SPACING/);
  assert.doesNotMatch(code, /0\.015/);
  const body = code.slice(code.indexOf('fn ambient_occlusion'), code.indexOf('fn inspection_light'));
  assert.match(body, /let spacing = SECONDARY_OFFSET \* tau;/);
  assert.match(body, /let h = f32\(k\) \* spacing;/);
  assert.doesNotMatch(body, /max\(/);
});

test('the shader legend, flag and colour literals equal the appearance constants', () => {
  const display = readFileSync(shaderPath('display'), 'utf8'), shade = readFileSync(shaderPath('shade'), 'utf8'), accumulate = readFileSync(shaderPath('accumulate'), 'utf8');
  const vec3 = (source, name) => {
    const match = source.match(new RegExp(`const ${name}: vec3<f32> = vec3<f32>\\(([^)]*)\\);`));
    assert.ok(match, `${name} is declared`); return match[1].split(',').map(Number);
  };
  const u32 = (source, name) => { const match = source.match(new RegExp(`const ${name}: u32 = (\\d+)u;`)); assert.ok(match, `${name} is declared`); return Number(match[1]); };
  for (const source of [display, shade]) {
    assert.deepEqual(vec3(source, 'LEGEND_UNRESOLVED'), LEGEND.unresolved);
    assert.deepEqual(vec3(source, 'LEGEND_NUMERICAL_FAILURE'), LEGEND.numericalFailure);
    assert.deepEqual(vec3(source, 'LEGEND_UNAVAILABLE_NORMAL'), LEGEND.unavailableNormal);
  }
  // Termination colours are display-space bytes, written as k/255 literals.
  assert.deepEqual(vec3(shade, 'TERMINATION_HIT').map(v => Math.round(v * 255)), TERMINATION_COLOURS.hit);
  assert.deepEqual(vec3(shade, 'TERMINATION_MISS').map(v => Math.round(v * 255)), TERMINATION_COLOURS.miss);
  for (const [name, value] of Object.entries(ACCUMULATION_FLAGS)) {
    const constant = `FLAG_${name.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase()}`;
    assert.equal(u32(accumulate, constant), value, `accumulate.wgsl ${constant}`);
    assert.equal(u32(display, constant), value, `display.wgsl ${constant}`);
  }
  assert.deepEqual(vec3(display, 'LIGHTING_TINT'), LIGHTING_TINT.colour);
  assert.equal(Number(display.match(/const LIGHTING_TINT_WEIGHT: f32 = ([0-9.]+);/)?.[1]), LIGHTING_TINT.weight);
  assert.equal(u32(display, 'VIEW_SHADED'), VIEW_MODE_CODES.shaded);
  assert.equal(u32(display, 'VIEW_NORMALS'), VIEW_MODE_CODES.normals);
  assert.equal(u32(display, 'STAGE_DIAGNOSTIC'), LIGHTING_STAGE_CODES.diagnostic);
  assert.equal(u32(shade, 'STAGE_FULL'), LIGHTING_STAGE_CODES.full);
  assert.deepEqual(Object.keys(VIEW_MODE_CODES), [...VIEW_MODES]);
  assert.deepEqual(Object.values(VIEW_MODE_CODES), VIEW_MODES.map((_, i) => i));
  assert.deepEqual(DIAGNOSTIC_MODES, VIEW_MODES.filter(mode => mode !== 'shaded'));
  assert.equal(VIEW_MODE_LABELS.steps, 'computational cost');
});

test('every dangerous appearance WGSL operation carries a guard annotation (source audit only)', () => {
  for (const id of Object.keys(APPEARANCE_HASHES.sources)) {
    const lines = readFileSync(shaderPath(id), 'utf8').split('\n');
    lines.forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, '');
      const dangerous = /\b(log|log2|sqrt|exp2|normalize|pow|inverseSqrt)\s*\(/.test(code) || /[^/*]\/[^/*=]/.test(code);
      if (!dangerous || /^\s*fn /.test(code)) return;
      assert.match(lines[index - 1] ?? '', /\/\/ guard:/, `${id}.wgsl:${index + 1} lacks a preceding // guard: annotation: ${line.trim()}`);
    });
  }
});

test('sample flags and display legends follow the documented precedence and are exact display bytes', () => {
  const word = (status, reason = 0, subreason = 0) => packStatus({ status, reason, subreason, steps: 7 });
  const hit = word(RAY_STATUS.hit), miss = word(RAY_STATUS.miss);
  const unresolved = word(RAY_STATUS.unresolved, UNRESOLVED_REASON.rayStepBudget), numerical = word(RAY_STATUS.numericalFailure);
  const F = ACCUMULATION_FLAGS;
  assert.equal(sampleFlags({ statusWord: hit, normalAvailable: true, lightingWord: 0 }), 0);
  assert.equal(sampleFlags({ statusWord: miss, normalAvailable: false, lightingWord: 0 }), 0, 'a miss has no normal and no flag');
  assert.equal(sampleFlags({ statusWord: hit, normalAvailable: false, lightingWord: 0 }), F.unavailableNormal);
  assert.equal(sampleFlags({ statusWord: unresolved, normalAvailable: false, lightingWord: 0 }), F.primaryUnresolved);
  assert.equal(sampleFlags({ statusWord: numerical, normalAvailable: false, lightingWord: 0 }), F.primaryNumericalFailure);
  const shadowStep = { status: RAY_STATUS.unresolved, reason: UNRESOLVED_REASON.rayStepBudget, subreason: STAGNATION.none };
  const aoNumerical = { status: RAY_STATUS.numericalFailure, reason: 0, subreason: 0 };
  assert.equal(sampleFlags({ statusWord: hit, normalAvailable: true, lightingWord: packLightingStatus({ shadow: shadowStep, ao: null }) }), F.shadowUnresolved);
  assert.equal(sampleFlags({ statusWord: hit, normalAvailable: true, lightingWord: packLightingStatus({ shadow: shadowStep, ao: aoNumerical }) }), F.shadowUnresolved | F.aoNumericalFailure);
  assert.equal(sampleFlags({ statusWord: hit, normalAvailable: true, lightingWord: packLightingStatus({ shadow: aoNumerical, ao: shadowStep }) }), F.shadowNumericalFailure | F.aoUnresolved);

  // Numerical failure, then unresolved, then (shaded and normals only) the unavailable normal.
  assert.equal(displayLegend(F.primaryUnresolved | F.aoNumericalFailure, VIEW_MODE_CODES.shaded), 'numericalFailure');
  // Rev 5.0 (B11b, user decision 2): a lighting-only unresolved outcome is no legend; it keeps the mean with the tint.
  assert.equal(displayLegend(F.shadowUnresolved | F.unavailableNormal, VIEW_MODE_CODES.shaded), 'unavailableNormal');
  assert.equal(displayLegend(F.shadowUnresolved | F.aoUnresolved, VIEW_MODE_CODES.shaded), null);
  assert.equal(displayLegend(F.aoUnresolved | F.primaryUnresolved, VIEW_MODE_CODES.shaded), 'unresolved');
  assert.equal(displayLegend(F.aoUnresolved | F.shadowNumericalFailure, VIEW_MODE_CODES.shaded), 'numericalFailure');
  assert.equal(displayLegend(F.unavailableNormal, VIEW_MODE_CODES.shaded), 'unavailableNormal');
  assert.equal(displayLegend(F.unavailableNormal, VIEW_MODE_CODES.normals), 'unavailableNormal');
  for (const mode of ['depth', 'steps', 'termination']) assert.equal(displayLegend(F.unavailableNormal, VIEW_MODE_CODES[mode]), null, `${mode}: an unavailable normal keeps its depth and cost`);
  assert.equal(displayLegend(0, VIEW_MODE_CODES.shaded), null);

  assert.deepEqual(legendBytes(LEGEND.unresolved), [255, 0, 255, 255]);
  assert.deepEqual(legendBytes(LEGEND.numericalFailure), [255, 0, 0, 255]);
  assert.deepEqual(legendBytes(LEGEND.unavailableNormal), [128, 128, 128, 255], 'round half up, written as an exact k/255');
  const sum = [0.4, 0.2, 0.1, 2];
  assert.deepEqual(expectedDisplay({ sum, flags: F.primaryUnresolved, lightingStage: LIGHTING_STAGE_CODES.full, viewMode: VIEW_MODE_CODES.shaded }), legendBytes(LEGEND.unresolved));
  assert.deepEqual(expectedDisplay({ sum, flags: 0, lightingStage: LIGHTING_STAGE_CODES.diagnostic, viewMode: VIEW_MODE_CODES.normals }), [51, 26, 13, 255], 'diagnostic values are display-space and never encoded');
  assert.deepEqual(expectedDisplay({ sum, flags: 0, lightingStage: LIGHTING_STAGE_CODES.direct, viewMode: VIEW_MODE_CODES.shaded }), [0.2, 0.1, 0.05].map(v => Math.round(srgbEncode(v) * 255)).concat(255), 'the mean is sRGB-encoded once');
  assert.deepEqual(expectedDisplay({ sum: [0, 0, 0, 0], flags: 0, lightingStage: 0, viewMode: 0 }), legendBytes(LEGEND.unresolved), 'no completed sample is never a colour');
  // The lighting-unresolved tint: the encoded mean mixed with LIGHTING_TINT in display space, on every flagged pixel.
  assert.deepEqual(LIGHTING_TINT, { colour: [0.8, 0.66, 0.36], weight: 0.2 });
  const tinted = [0.2, 0.1, 0.05].map((v, k) => Math.round((0.8 * srgbEncode(v) + 0.2 * LIGHTING_TINT.colour[k]) * 255)).concat(255);
  for (const flags of [F.aoUnresolved, F.shadowUnresolved, F.aoUnresolved | F.shadowUnresolved]) {
    assert.deepEqual(expectedDisplay({ sum, flags, lightingStage: LIGHTING_STAGE_CODES.full, viewMode: VIEW_MODE_CODES.shaded }), tinted);
  }
  const black = expectedDisplay({ sum: [0, 0, 0, 1], flags: F.aoUnresolved, lightingStage: LIGHTING_STAGE_CODES.full, viewMode: VIEW_MODE_CODES.shaded });
  assert.deepEqual(black, [41, 34, 18, 255], 'the tint marks even a black mean');
  assert.notDeepEqual(tinted.slice(0, 3), legendBytes(LEGEND.unresolved).slice(0, 3), 'never the primary magenta');
  assert.equal(srgbEncode(0), 0); assert.ok(Math.abs(srgbEncode(1) - 1) < 1e-15);
  assert.ok(Math.abs(srgbEncode(0.0031308) - 0.0031308 * 12.92) < 1e-12 && Math.abs(srgbEncode(0.5) - 0.7353569830524495) < 1e-12);
});

// ---- the B09 renderer drives the appearance descriptors (fake backend) ----
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
async function driveRenderer({ model, appearance = {}, profile = 'settled', samples = 2, size = { width: 16, height: 8 } }) {
  const clock = createFakeClock(), fake = createFakeBackend({ clock });
  const batches = [], tickets = [], allocations = [], released = new Set();
  const track = (method, desc, options) => { const ticket = fake[method](desc, options); const item = { ticket, pending: true }; tickets.push(item); ticket.done.then(() => { item.pending = false; }); return ticket; };
  const backend = { ...fake,
    allocate(desc) { const handle = fake.allocate(desc); allocations.push({ desc, handle }); return handle; },
    release(handle) { released.add(handle); return fake.release(handle); },
    submitBatch(batch, options) { batches.push(batch); return track('submitBatch', batch, options); },
    readback(desc, options) { if (desc.fields.includes('probe')) fake.stage(desc.source, new Uint8Array(Uint32Array.of(0x41544c53).buffer)); return track('readback', desc, options); },
    present(desc, options) { return track('present', desc, options); } };
  const scheduler = createScheduler({ clock, makeAdmission: createAdmission, setTimer: clock.schedule, clearTimer: clock.clear });
  const versions = { kernelVersion: 'space-fields-v1', tracingVersion: TRACING_VERSION };
  const renderer = createSpaceRenderer({ backend, scheduler, clock, viewId: 'space', versions, pipelineSet: productPipelineSet() });
  const until = async predicate => {
    for (let i = 0; i < 20000; i++) {
      await flush(); if (predicate()) return;
      const item = tickets.find(entry => entry.pending); if (item) { clock.advance(0.1); fake.complete(item.ticket, { elapsedMs: 8 }); }
    }
    assert.fail(`${model}: the bounded fake-backend driver did not reach its condition`);
  };
  let prepared, failure;
  renderer.prepare().then(value => { prepared = value; }, error => { failure = error; }); await flush(); fake.finishPrepare();
  await until(() => prepared !== undefined || failure !== undefined);
  assert.equal(failure, undefined, `${model}: preparation ${failure?.message}`);
  const base = createSpaceScene({ model });
  const scene = sceneCodec.validate({ ...base, appearance: { ...base.appearance, ...appearance }, sampling: { ...base.sampling, targetSamples: samples } });
  const request = createSpaceRequest({ scene, purpose: 'interactive', ...size, profile, generation: { deviceEpoch: fake.currentEpoch(), viewRevision: 1, geometryRevision: 1, appearanceRevision: 1 }, viewId: 'space', versions });
  let result; renderer.render(request).done.then(value => { result = value; });
  await until(() => result !== undefined);
  renderer.destroy();
  return { result, request, scene, batches, allocations, released };
}
const profileOf = request => ({ ...request.quality.iteration, ...request.quality.tracing });

test('the renderer drives the appearance descriptors with the shade, diagnostic, accumulate and display uniforms', async () => {
  for (const model of TRACE_FIELD_IDS) {
    for (const appearance of [{}, { lightingQuality: 'direct' }, ...DIAGNOSTIC_MODES.map(viewMode => ({ viewMode }))]) {
      const label = `${model} ${JSON.stringify(appearance)}`;
      const { result, request, scene, batches, allocations, released } = await driveRenderer({ model, appearance });
      assert.equal(result.outcome, 'completed', `${label}: ${result.reason}`);
      const { effective } = effectiveParameters(model, scene.parameters);
      const viewMode = scene.appearance.viewMode, internalSize = request.quality.internalSize;
      const shaded = batches.filter(b => b.pass === 'shade');
      assert.ok(shaded.length > 0, label);
      for (const batch of shaded) {
        const sampling = { seed: request.quality.sampling.seed, sampleIndex: batch.sample.index };
        const lighting = { ...request.quality.lighting, ...(batch.uniforms.lightingStage === LIGHTING_STAGE_CODES.direct ? { stage: 'direct', shadowRays: 0, shadowSteps: 0, aoSamples: 0 } : {}) };
        if (viewMode === 'shaded') {
          assert.equal(batch.pipelineId, `shade_band:${model}`, label);
          assert.deepEqual(batch.uniforms, shadeUniforms({ modelId: model, camera: scene.camera, effective, region: batch.region, internalSize, sampling, profile: profileOf(request), lighting }), `${label} shade uniforms`);
        } else {
          assert.equal(batch.pipelineId, viewMode === 'depth' ? `diagnostic_depth:${model}` : `diagnostic_${viewMode}`, label);
          assert.deepEqual(batch.uniforms, diagnosticUniforms({ modelId: model, viewMode, camera: scene.camera, effective, region: batch.region, internalSize, sampling, profile: profileOf(request) }), `${label} diagnostic uniforms`);
        }
      }
      const stages = new Set(shaded.map(b => b.uniforms.lightingStage));
      const expectedStages = viewMode !== 'shaded' ? [LIGHTING_STAGE_CODES.diagnostic] : appearance.lightingQuality === 'direct' ? [LIGHTING_STAGE_CODES.direct] : [LIGHTING_STAGE_CODES.direct, LIGHTING_STAGE_CODES.full];
      assert.deepEqual([...stages].sort(), expectedStages.sort(), `${label}: lighting stages`);
      if (viewMode === 'shaded') for (const b of shaded) assert.equal(b.uniforms.shadowSteps > 0, b.uniforms.lightingStage === LIGHTING_STAGE_CODES.full, `${label}: shadow steps only in the full stage`);
      for (const batch of batches.filter(b => b.pass === 'accumulate')) {
        assert.equal(batch.pipelineId, 'accumulate_band');
        assert.deepEqual(batch.uniforms, accumulateUniforms({ region: batch.region, sampleIndex: batch.sample.index }));
        assert.equal(batch.inputs.accumulationFlags, batch.outputs.accumulationFlags, 'flags are read-write on one target');
        assert.notEqual(batch.inputs.previous, batch.outputs.next, 'ping-pong');
      }
      const stage = viewMode !== 'shaded' ? LIGHTING_STAGE_CODES.diagnostic : null;
      for (const batch of batches.filter(b => b.pass === 'display')) {
        assert.equal(batch.pipelineId, 'display_band');
        assert.deepEqual(batch.uniforms, displayUniforms({ region: batch.region, lightingStage: stage ?? batch.uniforms.lightingStage, viewMode: VIEW_MODE_CODES[viewMode] }));
      }
      // The Menger box buffer (B10 report D2 → B11): allocated with mengerBoxData, bound, and released.
      const boxed = batches.filter(b => b.inputs.menger_boxes);
      if (model === 'menger') {
        const boxes = allocations.filter(a => a.desc.name.startsWith('menger-boxes'));
        assert.equal(boxes.length, 1, `${label}: one box buffer per job`);
        assert.deepEqual([...boxes[0].desc.data], [...mengerBoxData(effective.depth)]);
        assert.equal(boxes[0].desc.usage, 'storage');
        assert.ok(boxed.length > 0 && boxed.every(b => b.inputs.menger_boxes === boxes[0].handle), `${label}: every field-evaluating batch binds it`);
        assert.ok(boxed.some(b => b.pass === 'trace') && boxed.some(b => b.pass === 'normals'), label);
        assert.equal(boxed.some(b => b.pass === 'shade'), viewMode === 'shaded' ? true : false, label);
        assert.ok(released.has(boxes[0].handle), `${label}: released when the job settles`);
      } else assert.equal(boxed.length, 0, label);
    }
  }
});

test('after an appearance reset the renderer starts accumulation at sample 0 over every pixel once before the following samples', async () => {
  // The structural half of the B11 sample-0 obligation (the headed group executes the shaders on poisoned
  // targets). For a full-quality settled job: the direct sample 0, then the full-light samples 0 … n−1.
  const { result, request, batches } = await driveRenderer({ model: 'mandelbulb', samples: 3, size: { width: 300, height: 240 } });
  assert.equal(result.outcome, 'completed', result.reason);
  const { width, height } = request.quality.internalSize;
  const runs = [];
  let stage = null;
  for (const batch of batches) {
    if (batch.pass === 'shade') stage = batch.uniforms.lightingStage;
    if (batch.pass !== 'accumulate') continue;
    const key = `${stage}:${batch.sample.index}`;
    if (runs.at(-1)?.key !== key) runs.push({ key, stage, sample: batch.sample.index, regions: [], previous: new Set(), next: new Set() });
    runs.at(-1).regions.push(batch.region); runs.at(-1).previous.add(batch.inputs.previous); runs.at(-1).next.add(batch.outputs.next);
  }
  assert.deepEqual(runs.map(r => r.key), [`${LIGHTING_STAGE_CODES.direct}:0`, ...[0, 1, 2].map(s => `${LIGHTING_STAGE_CODES.full}:${s}`)], 'the reset restarts at sample 0 and samples ascend');
  for (const run of runs) {
    const covered = new Uint8Array(width * height);
    for (const r of run.regions) for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) covered[y * width + x]++;
    assert.ok(covered.every(n => n === 1), `${run.key}: every pixel accumulated exactly once`);
    assert.ok(run.regions.length > 1, `${run.key}: the frame is subdivided`);
    assert.equal(run.previous.size, 1); assert.equal(run.next.size, 1);
  }
  // Sample s reads accumulation[s & 1] and writes accumulation[(s + 1) & 1]; the reset's sample 0 writes the same
  // target as the direct sample 0, so sample-0 initialization must not read what is already there.
  assert.equal([...runs[0].next][0], [...runs[1].next][0]);
  assert.equal([...runs[1].next][0], [...runs[2].previous][0]);
  assert.equal([...runs[2].next][0], [...runs[3].previous][0]);
});
