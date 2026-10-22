// B11c (Codex B11b-F7): the lossless visual capture and its verifier, on a hand-built 4 × 2 archive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import * as va from '../support/visual-acceptance.mjs';
import * as appearance from '../../src/space/render/webgpu/appearance.js';
import { decodeRawSample, writeCaptureScene, readCaptureScene, recomputeScene, verifyCaptureScene, sha256 } from '../support/visual-capture.mjs';

const B = va.VA_BITS, F = appearance.ACCUMULATION_FLAGS;
// Sample 0: hit; miss; hit without a normal; unresolved point-budget; hit with AO unresolved (point-budget); hit with a
// numerical shadow; unresolved stagnation/field-coordinate; numerical. Sample 1: pixel 0 unresolved ray-step-budget.
const S0 = { status: [0, 1, 0, 0x12, 0, 0, 0x242, 3], lighting: [0, 0, 0, 0, 2 | (2 << 12) | (1 << 14), 1 | (3 << 2), 0, 0], normalW: [0x3c00, 0, 0, 0, 0x3c00, 0x3c00, 0, 0] };
const S1 = { status: [0x32, 1, 1, 1, 1, 1, 1, 1], lighting: new Array(8).fill(0), normalW: new Array(8).fill(0) };
const typed = s => ({ status: Uint32Array.from(s.status), lighting: Uint32Array.from(s.lighting), normalW: Uint16Array.from(s.normalW) });
const deps = { va, appearance };
const toFlags = v => (v & B.numerical ? F.primaryNumericalFailure : 0) | (v & B.unresolved ? F.primaryUnresolved : 0) | (v & B.normalUnavailable ? F.unavailableNormal : 0)
  | (v & B.shadowUnresolved ? F.shadowUnresolved : 0) | (v & B.shadowNumerical ? F.shadowNumericalFailure : 0) | (v & B.aoUnresolved ? F.aoUnresolved : 0) | (v & B.aoNumerical ? F.aoNumericalFailure : 0);

async function buildArchive(dir, { reported } = {}) {
  const samples = [typed(S0), typed(S1)], decoded = samples.map(decodeRawSample), union = va.orBits(decoded.map(d => d.bits));
  const flags = Uint32Array.from(union, toFlags), sums = Float32Array.from({ length: 32 }, (_, k) => (k % 4 === 3 ? 1 : 0.5)), display = new Uint8Array(32);
  for (let i = 0; i < 8; i++) if (flags[i]) display.set(appearance.expectedDisplay({ sum: [...sums.subarray(4 * i, 4 * i + 4)], flags: flags[i], lightingStage: appearance.LIGHTING_STAGE_CODES.full, viewMode: appearance.VIEW_MODE_CODES.shaded }), 4 * i);
  const hash = a => sha256(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  const meta = { id: 'synthetic', class: 'fractal', model: 'mandelbulb', settings: { width: 4, height: 2, targetSamples: 2, seed: 1 }, crops: [], views: ['shaded-full', 'normals'],
    ordinals: [0, 1, 2], sampleOrdinals: [1, 2], viewOrdinals: { 'shaded-full': [1, 2], normals: [0, 1] }, coverage: { 1: { status: 8 }, 2: { status: 8 } },
    viewStatusSha256: { 'shaded-full': [null, hash(samples[0].status), hash(samples[1].status)], normals: [hash(samples[0].status), hash(samples[1].status)] }, reported: reported ?? {} };
  const entries = samples.flatMap((s, k) => [
    { name: `status-o${k + 1}`, field: 'status', ordinal: k + 1, dtype: 'u32', data: s.status }, { name: `lighting-o${k + 1}`, field: 'lightingStatus', ordinal: k + 1, dtype: 'u32', data: s.lighting },
    { name: `normalw-o${k + 1}`, field: 'normal.w', ordinal: k + 1, dtype: 'u16', data: s.normalW }, { name: `pagebits-o${k + 1}`, field: 'page-mask', ordinal: k + 1, dtype: 'u16', data: decoded[k].bits }]);
  entries.push({ name: 'union-bits', field: 'union-mask', dtype: 'u16', data: union }, { name: 'display', field: 'display', dtype: 'u8', data: display },
    { name: 'accumulation', field: 'accumulation', dtype: 'f32', data: sums }, { name: 'flags', field: 'accumulationFlags', dtype: 'u32', data: flags });
  await writeCaptureScene(dir, meta, entries);
}

test('raw words decode to the visual masks and reason codes, independently of the page', () => {
  const d = decodeRawSample(typed(S0));
  assert.deepEqual([...d.bits], [B.hit, B.miss, B.hit | B.normalUnavailable, B.unresolved, B.hit | B.aoUnresolved, B.hit | B.shadowNumerical, B.unresolved, B.numerical]);
  assert.deepEqual([...d.reasonPairs], [3, 1, 4, 1 << 6, 6, 5]);
  assert.equal(d.bits[2], va.sampleBits({ status: 0, normalAvailable: false })); assert.equal(va.vaReasonCode(4, 2), 5);
});

test('the verifier recomputes every metric from the archive alone, and the numbers are the hand-counted ones', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'va-capture-'));
  try {
    await buildArchive(dir);
    const { metrics, problems } = recomputeScene(await readCaptureScene(dir), deps);
    assert.deepEqual(problems, []);
    assert.deepEqual(metrics.union, { pixels: 8, hits: 4, nonMiss: 7, primaryUnresolved: 3, numericalFailures: 2, unavailableNormals: 1, lightingUnresolved: 1, shadowUnresolved: 0, aoUnresolved: 1, lightingNumericalFailures: 1 });
    assert.equal(metrics.perSample[1].primaryUnresolved, 1);
    assert.equal(metrics.reasons.union.primaryUnresolved['point-budget'], 1); assert.equal(metrics.reasons.union.primaryUnresolved['ray-step-budget'], 1);
    assert.equal(metrics.reasons.union.primaryUnresolved['stagnation/field-coordinate'], 1); assert.equal(metrics.reasons.union.aoUnresolved['point-budget'], 1);
    assert.equal(metrics.identicalRays, true); assert.equal(metrics.flagMismatch, 0); assert.equal(metrics.lightingIndicated, 1); assert.equal(metrics.lostIndication, 0); assert.equal(metrics.lightingAsMagenta, 0);
    const row = metrics.thresholds.rows.find(r => r.metric === 'primaryUnresolved'); assert.deepEqual([row.numerator, row.denominator], [3, 7]);
    // A reported row equal to the recomputation verifies; a changed reported count does not.
    const reported = { ...JSON.parse(JSON.stringify(metrics)), failures: [] };
    await buildArchive(dir, { reported });
    assert.equal((await verifyCaptureScene(dir, deps)).ok, true);
    await buildArchive(dir, { reported: { ...reported, union: { ...reported.union, hits: 5 } } });
    assert.deepEqual((await verifyCaptureScene(dir, deps)).mismatches, ['union']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a tampered file, a page mask that disagrees with the raw words, or a stale union mask is caught', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'va-capture-'));
  try {
    await buildArchive(dir);
    const path = join(dir, 'status-o1.u32.gz'), bytes = new Uint8Array(gunzipSync(await readFile(path)));
    bytes[0] ^= 1; await writeFile(path, gzipSync(bytes));
    await assert.rejects(readCaptureScene(dir), /SHA-256 mismatch/);
    await buildArchive(dir);
    const scene = JSON.parse(await readFile(join(dir, 'scene.json'), 'utf8'));
    for (const name of ['pagebits-o1', 'union-bits']) {
      const f = scene.files.find(e => e.name === name), p = join(dir, f.file), b = new Uint8Array(gunzipSync(await readFile(p)));
      b[2] ^= B.hit; await writeFile(p, gzipSync(b)); f.sha256 = sha256(b);
    }
    await writeFile(join(dir, 'scene.json'), JSON.stringify(scene));
    const { problems } = recomputeScene(await readCaptureScene(dir), deps);
    assert.ok(problems.some(p => /page's mask differs/.test(p)), problems.join('; '));
    assert.ok(problems.some(p => /archived union mask differs/.test(p)), problems.join('; '));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
