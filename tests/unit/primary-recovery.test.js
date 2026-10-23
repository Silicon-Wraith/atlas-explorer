// Spec §11.4 quaternion-primary bounded recovery (rev 5.1, user-approved 2026-10-22; plan B11b "Rev 5.1 follow-ups"
// FU2, implemented by B11c). Node-only: the binary32 mirror reproduces the hand-derived path of every scripted case,
// the recovery word and the ray-list encoding round-trip, and the kernel's literals and call sites match. The GPU
// comparison of the same cases runs in the headed `rendering` group; CPU checks never qualify the GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCRIPTED_RECOVERY_CASES, RECOVERY_MIDPOINT_LIMIT, RECOVERY_OUTCOMES, RECOVERY_STOPS, mirrorCase, comparable } from '../support/primary-recovery.mjs';
import {
  TRACING_VERSION, RECOVERY_WORD, packRecoveryWord, decodeRecoveryWord, decodeRecoveryWords, encodeRays, decodeRayResults, TRACE_RESULT_BYTES,
  VALIDATION_FIELD_IDS, TRACE_FIELD_IDS, traceRaysUniforms, traceLayout,
} from '../../src/space/render/webgpu/passes.js';
import { packStatus } from '../../src/space/render/status.js';

const source = id => readFileSync(new URL(`../../src/space/render/webgpu/shaders/${id}.wgsl`, import.meta.url), 'utf8');
const code = id => source(id).split('\n').filter(line => !line.trim().startsWith('//')).join('\n');

test('the binary32 mirror reproduces the hand-derived recovery path of every scripted case', () => {
  assert.equal(RECOVERY_MIDPOINT_LIMIT, 8);
  const seen = new Set();
  for (const c of SCRIPTED_RECOVERY_CASES) {
    const r = comparable(mirrorCase(c)), e = c.expect;
    assert.equal(r.status, e.status, c.id); assert.equal(r.reason, e.reason ?? null, c.id); assert.equal(r.subreason, null, c.id);
    assert.equal(r.steps, e.steps, `${c.id}: every midpoint counts toward the primary evaluations`);
    assert.equal(r.recovery.attempted, e.attempted, c.id);
    if (!e.attempted) { assert.deepEqual(r.recovery, { attempted: false, outcome: 'none', stop: 'none', midpoints: 0, encounters: 0 }, c.id); continue; }
    assert.equal(r.recovery.outcome, e.outcome, c.id); assert.equal(r.recovery.stop, e.stop ?? 'none', c.id);
    assert.equal(r.recovery.midpoints, e.midpoints, c.id);
    if (e.encounters !== undefined) assert.equal(r.recovery.encounters, e.encounters, c.id);
    assert.ok(r.recovery.midpoints <= RECOVERY_MIDPOINT_LIMIT && r.recovery.encounters >= 1, c.id);
    seen.add(r.recovery.outcome); seen.add(r.recovery.stop);
  }
  // Every terminal outcome and every stop detail is exercised.
  for (const label of [...RECOVERY_OUTCOMES.slice(1), ...RECOVERY_STOPS.slice(1)]) assert.ok(seen.has(label), `no scripted case reaches ${label}`);
});

test('recovery is primary-only and family-gated: a secondary ray and a non-recovering family keep the terminal point-budget', () => {
  const primary = SCRIPTED_RECOVERY_CASES.find(c => c.id === 'success-b-update'), secondary = SCRIPTED_RECOVERY_CASES.find(c => c.id === 'secondary-unchanged');
  const off = comparable(mirrorCase(primary, { recovery: false })), sec = comparable(mirrorCase(secondary));
  assert.deepEqual(off, sec, 'the other-family and secondary results are the unrecovered march');
  assert.deepEqual([off.status, off.reason, off.steps], ['unresolved', 'point-budget', 4]);
  // The encountered point-budget of a successful recovery stays in the diagnostics, distinct from the terminal outcome.
  const ok = comparable(mirrorCase(primary));
  assert.equal(ok.status, 'approximate hit'); assert.equal(ok.recovery.encounters, 2);
});

test('the recovery word packs midpoints, encounters, outcome and stop detail and the ray list carries it beside the interior detail', () => {
  assert.equal(TRACING_VERSION, 'surface-v1/space-trace-v3');
  assert.deepEqual(RECOVERY_WORD.outcomes, RECOVERY_OUTCOMES); assert.deepEqual(RECOVERY_WORD.stops, RECOVERY_STOPS);
  assert.equal(RECOVERY_WORD.midpointLimit, RECOVERY_MIDPOINT_LIMIT);
  assert.equal(packRecoveryWord({ attempted: false, outcome: 'none', stop: 'none', midpoints: 0, encounters: 0 }), 0);
  assert.deepEqual(decodeRecoveryWord(0), { attempted: false, outcome: 'none', stop: 'none', midpoints: 0, encounters: 0 });
  for (const c of SCRIPTED_RECOVERY_CASES) {
    const rec = mirrorCase(c).recovery, word = packRecoveryWord(rec);
    assert.deepEqual(decodeRecoveryWord(word), rec, c.id);
  }
  assert.equal(packRecoveryWord({ attempted: true, outcome: 'point-budget', stop: 'midpoint-limit', midpoints: 8, encounters: 6 }), 8 | 6 << 4 | 4 << 8 | 1 << 12);
  assert.throws(() => packRecoveryWord({ attempted: true, outcome: 'approximate hit', stop: 'none', midpoints: 9, encounters: 1 }), /midpoints/);
  assert.throws(() => decodeRecoveryWord(7 << 8), /outcome/);
  assert.throws(() => decodeRecoveryWord(1), /attempt/, 'midpoints without an attempt are invalid');
  // decodeRecoveryWords decodes a frame of r32uint words.
  const frame = new Uint32Array([0, packRecoveryWord({ attempted: true, outcome: 'approximate hit', stop: 'none', midpoints: 2, encounters: 2 })]);
  assert.deepEqual(decodeRecoveryWords(new Uint8Array(frame.buffer)).map(r => r.outcome), ['none', 'approximate hit']);
  // The secondary flag rides in low.w; the result's z word is detail | recovery << 8.
  const bytes = encodeRays([{ origin: [0, 0, 0], direction: [1, 0, 0], interval: { enter: 0, exit: 1 }, secondary: true }, { origin: [0, 0, 0], direction: [1, 0, 0] }]);
  const floats = new Float32Array(bytes.buffer);
  assert.deepEqual([floats[7], floats[16 + 7]], [1, 0]);
  const out = new DataView(new ArrayBuffer(2 * TRACE_RESULT_BYTES)), rec = packRecoveryWord({ attempted: true, outcome: 'point-budget', stop: 'evaluation-cap', midpoints: 2, encounters: 3 });
  out.setUint32(0, packStatus({ status: 2, reason: 1, subreason: 0, steps: 6 }), true); out.setFloat32(4, 2.7, true); out.setUint32(8, rec << 8, true); out.setUint32(12, 6, true);
  out.setUint32(16, packStatus({ status: 2, reason: 2, subreason: 1, steps: 1 }), true); out.setUint32(24, 1, true); out.setUint32(28, 1, true);
  const [a, b] = decodeRayResults(new Uint8Array(out.buffer), 2);
  assert.deepEqual([a.status, a.reason, a.detail, a.recovery.stop, a.recovery.midpoints], ['unresolved', 'point-budget', null, 'evaluation-cap', 2]);
  assert.deepEqual([b.reason, b.detail, b.recovery.attempted], ['estimate-unavailable', 'interior', false]);
});

test('the scripted field is validation-only and packs its script into C, kappa and power', () => {
  assert.ok(VALIDATION_FIELD_IDS.includes('scripted') && !TRACE_FIELD_IDS.includes('scripted'));
  assert.equal(VALIDATION_FIELD_IDS.indexOf('scripted'), 6);
  assert.deepEqual(traceLayout('scripted').fields.map(f => f.name).slice(-3), ['C', 'kappa', 'power']);
  const c = SCRIPTED_RECOVERY_CASES.find(x => x.id === 'coordinate-collapse');
  const u = traceRaysUniforms({ modelId: 'scripted', effective: c.effective, count: 1, pitch: 1, profile: c.profile });
  assert.deepEqual([u.C, u.kappa, u.power], [[12, 12, 3, 0], 2 ** 26, 0]);
  // Every scripted case is admitted exactly as the GPU will see it (binary32 script values).
  for (const x of SCRIPTED_RECOVERY_CASES) assert.doesNotThrow(() => traceRaysUniforms({ modelId: 'scripted', effective: x.effective, count: 1, pitch: 1, profile: x.profile }), x.id);
  assert.throws(() => traceRaysUniforms({ modelId: 'scripted', effective: { C: [0, 0, 0.5, 0], kappa: 0, power: 3 }, count: 1, pitch: 1, profile: c.profile }), /band/);
});

test('the kernel recovers quaternion primary rays only, with the frozen literals, and every caller states its role', () => {
  const trace = code('trace');
  assert.match(trace, /const RECOVERY_MIDPOINT_LIMIT: u32 = 8u;/);
  RECOVERY_OUTCOMES.forEach((label, k) => assert.match(trace, new RegExp(`const RECOVERY_OUTCOME_[A-Z_]+: u32 = ${k}u;`), label));
  RECOVERY_STOPS.forEach((label, k) => assert.match(trace, new RegExp(`const RECOVERY_STOP_[A-Z_]+: u32 = ${k}u;`), label));
  assert.match(trace, /const FIELD_SCRIPTED: u32 = 6u;/);
  assert.match(trace, /fn recovering_family\(\) -> bool \{ return FIELD == FIELD_QUATERNION \|\| FIELD == FIELD_SCRIPTED; \}/);
  assert.match(trace, /fn march\(high: vec3<f32>, low: vec3<f32>, d: vec3<f32>, use_given: bool, given: Interval, primary: bool\) -> TraceResult/);
  assert.match(trace, /if \(primary && recovering_family\(\) && steps >= 2u\)/, 'an initial-point failure stays terminal');
  assert.match(trace, /march\(u\.origin_high, u\.origin_low, pixel_direction\(px\), false, Interval\(0u, 0\.0, 0\.0\), true\)/, 'trace_pixel is primary');
  assert.match(code('shade'), /march\(origin, vec3<f32>\(0\.0\), l, true, Interval\(0u, max\(t, volume\.enter\), volume\.exit\), false\)/, 'the shadow ray is secondary');
  assert.match(code('trace-rays'), /ray\.low\.w != 1\.0/, 'a validation ray is primary unless flagged secondary');
  assert.match(code('trace-band'), /textureStore\(recovery_out, vec2<i32>\(px\), vec4<u32>\(r\.recovery, 0u, 0u, 1u\)\)/);
  // The normals stencil never marches; AO samples the field directly: neither recovers.
  assert.doesNotMatch(code('normals'), /march\(/);
});
