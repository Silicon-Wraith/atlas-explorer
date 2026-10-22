// Lossless visual-acceptance capture and its verifier (B11c; Codex B11b-F7). Test harness only: it never touches
// product sources, identities or hashes.
//
// With ATLAS_VISUAL_CAPTURE=<dir>, the visual check archives one directory per scene. The archive holds, pixel-indexed:
// the raw words of every ordinal of the shaded-full view (the primary status word with its status, reason and subreason;
// the lightingStatus word; the normal's availability half; the recovery [pixel, word] pairs of a recovering family);
// the page's own per-sample masks and reason pairs; the union masks (VA bits and reason lanes); the presented display,
// the accumulation sums and flags; and the face-normal hit records of analytic scenes. Each file is gzip-compressed and
// listed with its encoding and the SHA-256 of its uncompressed bytes; scene.json also holds the row exactly as reported.
//
// verifyCaptureScene recomputes every reported metric from the archive alone: the per-sample and union VA metrics, the
// reason histograms, the recovery metrics, the accumulated-flag agreement, the presentation counts, the threshold rows,
// the face-normal tallies and the crops. It decodes the raw words with this file's own rule, independently of the page.
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const CAPTURE_FORMAT = 'atlas-visual-capture-v1';
const DTYPES = Object.freeze({ u8: Uint8Array, u16: Uint16Array, u32: Uint32Array, f32: Float32Array });
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const asBytes = array => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

// ---- the raw-word decoding (this file's own statement of the B00 / B11 word layouts the visual check reads) -------
// Primary status word: bits 0-3 class (0 hit, 1 miss, 2 unresolved, 3 numerical failure), 4-7 reason, 8-11 subreason.
// lightingStatus word: bit 0 shadow failed, bits 2-3 its status (2 unresolved, 3 numerical), 4-7 / 8-11 its reason and
// subreason; bit 1 AO failed, bits 12-13 its status, 14-17 / 18-21 its reason and subreason. Normal: the w half's low
// 15 bits are nonzero when the normal is available.
export const RAW_BITS = Object.freeze({ hit: 1, miss: 2, unresolved: 4, numerical: 8, normalUnavailable: 16, shadowUnresolved: 32, shadowNumerical: 64, aoUnresolved: 128, aoNumerical: 256 });
const reasonCode = (reason, subreason) => (reason >= 1 && reason <= 3 ? reason : reason === 4 && (subreason === 1 || subreason === 2) ? 3 + subreason : 6);
export function decodeRawSample({ status, lighting, normalW }) {
  const pixels = status.length, bits = new Uint16Array(pixels), codes = new Uint16Array(pixels), B = RAW_BITS;
  for (let i = 0; i < pixels; i++) {
    const s = status[i], cls = s & 15;
    if (cls > 3) throw new RangeError(`pixel ${i}: status class ${cls}`);
    let v = [B.hit, B.miss, B.unresolved, B.numerical][cls], c = 0;
    if (cls === 2) c |= reasonCode((s >>> 4) & 15, (s >>> 8) & 15);
    if (cls === 0 && (normalW[i] & 0x7fff) === 0) v |= B.normalUnavailable;
    const w = lighting[i];
    if (w & 1) v |= ((w >>> 2) & 3) === 3 ? B.shadowNumerical : B.shadowUnresolved;
    if (w & 2) v |= ((w >>> 12) & 3) === 3 ? B.aoNumerical : B.aoUnresolved;
    if ((w & 1) && ((w >>> 2) & 3) === 2) c |= reasonCode((w >>> 4) & 15, (w >>> 8) & 15) << 3;
    if ((w & 2) && ((w >>> 12) & 3) === 2) c |= reasonCode((w >>> 14) & 15, (w >>> 18) & 15) << 6;
    bits[i] = v; codes[i] = c;
  }
  const pairs = []; for (let i = 0; i < pixels; i++) if (codes[i]) pairs.push(i, codes[i]);
  return { bits, reasonPairs: Uint32Array.from(pairs) };
}

// ---- writing and reading ------------------------------------------------------------------------------------------
// entries: [{ name, field, ordinal?, sample?, dtype, data (typed array) }]; meta: everything else (JSON).
export async function writeCaptureScene(dir, meta, entries) {
  await mkdir(dir, { recursive: true });
  const files = [];
  for (const e of entries) {
    if (!DTYPES[e.dtype] || !(e.data instanceof DTYPES[e.dtype])) throw new TypeError(`${e.name}: data is not ${e.dtype}`);
    const bytes = asBytes(e.data), file = `${e.name}.${e.dtype}.gz`;
    await writeFile(join(dir, file), gzipSync(bytes, { level: 6 }));
    files.push({ name: e.name, file, field: e.field, ordinal: e.ordinal ?? null, sample: e.sample ?? null, dtype: e.dtype, length: e.data.length, byteLength: bytes.byteLength, littleEndian: true, sha256: sha256(bytes) });
  }
  const scene = { format: CAPTURE_FORMAT, ...meta, files };
  const text = JSON.stringify(scene);
  await writeFile(join(dir, 'scene.json'), text);
  return { sceneSha256: sha256(Buffer.from(text)), files: files.length };
}
export async function readCaptureScene(dir) {
  const scene = JSON.parse(await readFile(join(dir, 'scene.json'), 'utf8'));
  if (scene.format !== CAPTURE_FORMAT) throw new Error(`${dir}: format ${scene.format}`);
  const data = {};
  for (const f of scene.files) {
    const bytes = gunzipSync(await readFile(join(dir, f.file)));
    if (bytes.byteLength !== f.byteLength) throw new Error(`${f.file}: ${bytes.byteLength} bytes, expected ${f.byteLength}`);
    if (sha256(bytes) !== f.sha256) throw new Error(`${f.file}: SHA-256 mismatch`);
    const copy = new Uint8Array(bytes); // aligned
    data[f.name] = new DTYPES[f.dtype](copy.buffer, 0, f.length);
  }
  return { scene, data };
}

// ---- recomputation ----------------------------------------------------------------------------------------------
// deps: { va (tests/support/visual-acceptance.mjs), appearance (src/.../appearance.js), faces? } from the tree whose
// assembly was measured. faces: { recordsOf(sample) -> records } is built here from the archived hit records.
export function recomputeScene({ scene, data }, deps) {
  const { va, appearance } = deps, F = appearance.ACCUMULATION_FLAGS, B = va.VA_BITS, problems = [];
  if (!isDeepStrictEqual({ ...B }, { ...RAW_BITS })) throw new Error('VA_BITS differ from the capture layout');
  const pixels = scene.settings.width * scene.settings.height, samples = [...Array(scene.settings.targetSamples).keys()];
  const ordinal = sample => scene.sampleOrdinals[sample];
  for (const o of scene.ordinals) if (scene.coverage?.[o] && scene.coverage[o].status !== pixels) problems.push(`ordinal ${o}: status covers ${scene.coverage[o].status} of ${pixels} pixels`);
  const decoded = samples.map(sample => decodeRawSample({ status: data[`status-o${ordinal(sample)}`], lighting: data[`lighting-o${ordinal(sample)}`], normalW: data[`normalw-o${ordinal(sample)}`] }));
  samples.forEach(sample => {
    const page = data[`pagebits-o${ordinal(sample)}`], pagePairs = data[`pagereasons-o${ordinal(sample)}`];
    if (page && !isDeepStrictEqual(page, decoded[sample].bits)) problems.push(`sample ${sample}: the page's mask differs from the raw-word decoding`);
    if (pagePairs && !isDeepStrictEqual(pagePairs, decoded[sample].reasonPairs)) problems.push(`sample ${sample}: the page's reason pairs differ from the raw-word decoding`);
  });
  const perSampleBits = decoded.map(d => d.bits), union = va.orBits(perSampleBits);
  if (data['union-bits'] && !isDeepStrictEqual(data['union-bits'], union)) problems.push('the archived union mask differs from the union of the raw samples');
  const lanes = decoded.map(d => va.vaReasonLanes(d.reasonPairs, pixels)), unionLanes = va.orBits32(lanes);
  if (data['union-reasons'] && !isDeepStrictEqual(data['union-reasons'], unionLanes)) problems.push('the archived union reason lanes differ from the raw samples');
  const out = { perSample: perSampleBits.map(bits => va.vaMetrics(bits)), union: va.vaMetrics(union),
    reasons: { union: va.vaReasonMetrics(unionLanes), perSample: lanes.map(va.vaReasonMetrics) } };
  const recoveryFrames = samples.map(sample => data[`recovery-o${ordinal(sample)}`] ?? null);
  out.recovery = recoveryFrames.every(f => f === null) ? null : va.vaRecoveryMetrics(recoveryFrames.map(f => f ?? new Uint32Array(0)), pixels);
  // Identical rays across the four views (status hashes per view and ordinal), and the raw frames' own hashes.
  out.identicalRays = samples.every(sample => new Set(scene.views.map(view => scene.viewStatusSha256[view][scene.viewOrdinals[view][sample]])).size === 1);
  samples.forEach(sample => { if (sha256(asBytes(data[`status-o${ordinal(sample)}`])) !== scene.viewStatusSha256['shaded-full'][ordinal(sample)]) problems.push(`sample ${sample}: raw status bytes differ from the page's status SHA-256`); });
  // Presentation and accumulated flags.
  const toFlags = v => (v & B.numerical ? F.primaryNumericalFailure : 0) | (v & B.unresolved ? F.primaryUnresolved : 0) | (v & B.normalUnavailable ? F.unavailableNormal : 0)
    | (v & B.shadowUnresolved ? F.shadowUnresolved : 0) | (v & B.shadowNumerical ? F.shadowNumericalFailure : 0) | (v & B.aoUnresolved ? F.aoUnresolved : 0) | (v & B.aoNumerical ? F.aoNumericalFailure : 0);
  const LIGHTING = F.shadowUnresolved | F.aoUnresolved, OTHER = F.primaryNumericalFailure | F.primaryUnresolved | F.unavailableNormal | F.shadowNumericalFailure | F.aoNumericalFailure;
  const display = data.display, sums = data.accumulation, flags = data.flags;
  let flagMismatch = 0, lightingAsMagenta = 0, lostIndication = 0, tinted = 0;
  for (let i = 0; i < pixels; i++) {
    if (flags[i] !== toFlags(union[i])) flagMismatch++;
    const f = flags[i]; if (!f) continue;
    const sum = [sums[4 * i], sums[4 * i + 1], sums[4 * i + 2], sums[4 * i + 3]], got = display.subarray(4 * i, 4 * i + 4);
    const stage = appearance.LIGHTING_STAGE_CODES.full, mode = appearance.VIEW_MODE_CODES.shaded;
    const expected = appearance.expectedDisplay({ sum, flags: f, lightingStage: stage, viewMode: mode });
    const lightingOnly = (f & LIGHTING) !== 0 && !(f & OTHER);
    const plain = lightingOnly ? appearance.expectedDisplay({ sum, flags: 0, lightingStage: stage, viewMode: mode }) : null;
    const c = va.classifyFlaggedPixel({ got, expected, plain, lightingOnly });
    if (c.magenta) lightingAsMagenta++; if (c.tinted) tinted++; if (c.lost) lostIndication++;
  }
  Object.assign(out, { flagMismatch, lightingAsMagenta, lostIndication, lightingIndicated: tinted });
  out.thresholds = va.evaluateScene({ sceneClass: scene.class, union: out.union, lightingAsMagenta, lostIndication });
  // Faces (analytic scenes) from the archived hit records.
  const W = scene.settings.width, cropIndex = (crop, i) => { const x = i % W, y = Math.floor(i / W); return x >= crop.x && x < crop.x + crop.width && y >= crop.y && y < crop.y + crop.height; };
  const cropRecords = Object.fromEntries(scene.crops.map(crop => [crop.id, []]));
  out.faces = null;
  if (scene.class === 'analytic') {
    const tallies = [];
    for (const sample of samples) {
      const records = deps.faceRecords(scene, data[`faces-s${sample}`], sample);
      for (const r of records) for (const crop of scene.crops) if (cropIndex(crop, r.pixel)) cropRecords[crop.id].push(r);
      tallies.push(va.faceNormalTally(records));
      if (sha256(asBytes(data[`status-o${ordinal(sample)}`])) !== scene.tracedStatusSha256[sample]) problems.push(`sample ${sample}: the direct trace differs from the renderer's rays`);
    }
    out.faces = va.mergeTallies(tallies);
  }
  const strip = (object, key) => { const { [key]: _drop, ...rest } = object; return rest; };
  out.crops = scene.crops.map(crop => {
    const inside = []; for (let i = 0; i < pixels; i++) if (cropIndex(crop, i)) inside.push(union[i]);
    const metrics = va.vaMetrics(inside), faces = scene.class === 'analytic' ? va.mergeTallies([va.faceNormalTally(cropRecords[crop.id])]) : null;
    return { ...crop, metrics, faces: faces && strip(faces, 'worst'), passed: metrics.unavailableNormals === 0 && (!faces || faces.unavailable === 0) };
  });
  return { metrics: out, problems };
}

// The reported row fields the recomputation must reproduce exactly (JSON-normalised).
export const VERIFIED_FIELDS = Object.freeze(['perSample', 'union', 'reasons', 'recovery', 'identicalRays', 'lightingAsMagenta', 'lostIndication', 'lightingIndicated', 'thresholds', 'faces', 'crops']);
export function compareToReported(metrics, reported) {
  const norm = v => JSON.parse(JSON.stringify(v ?? null)), mismatches = [];
  for (const field of VERIFIED_FIELDS) {
    const want = field === 'recovery' ? (reported.recovery ?? null) : reported[field];
    if (field === 'faces' && reported.faces === undefined && metrics.faces === null) continue;
    if (!isDeepStrictEqual(norm(metrics[field]), norm(want))) mismatches.push(field);
  }
  if (metrics.flagMismatch !== 0 && !reported.failures?.some(f => /accumulated flags differ/.test(f))) mismatches.push('flagMismatch');
  return mismatches;
}
export async function verifyCaptureScene(dir, deps) {
  const archive = await readCaptureScene(dir), { metrics, problems } = recomputeScene(archive, deps);
  const mismatches = compareToReported(metrics, archive.scene.reported);
  return { id: archive.scene.id, ok: problems.length === 0 && mismatches.length === 0, problems, mismatches, metrics };
}

// Face-normal hit records of one sample from the archived 16-byte records (pixel u32, t f32, rgba16float normal),
// rebuilt exactly as the visual check builds them. mods: { va, basis (camera.js), sampleJitter (backend.js), halfToNumber (passes.js) }.
export function makeFaceRecords(mods) {
  return (scene, bytes, sample) => {
    const { va } = mods, W = scene.settings.width, H = scene.settings.height, camera = scene.camera, alpha = 2 * Math.tan(Math.PI / 6) / H;
    const { forward, right, up } = mods.basis(camera), hTan = Math.tan(camera.verticalFovDegrees * Math.PI / 360), origin = camera.positionLocal;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), records = [];
    for (let k = 0; k < bytes.byteLength / 16; k++) {
      const pixel = view.getUint32(16 * k, true), depth = view.getFloat32(16 * k + 4, true), x = pixel % W, y = Math.floor(pixel / W);
      const halves = [0, 1, 2, 3].map(c => view.getUint16(16 * k + 8 + 2 * c, true));
      const jitter = mods.sampleJitter({ seed: scene.settings.seed, sampleIndex: sample, pixel: [x, y] });
      const sx = (2 * ((x + 0.5 + jitter.dx) / W) - 1) * hTan * (W / H), sy = (1 - 2 * ((y + 0.5 + jitter.dy) / H)) * hTan;
      const dRaw = forward.map((f, a) => f + sx * right[a] + sy * up[a]), dLen = Math.hypot(...dRaw), d = dRaw.map(v => v / dLen);
      const p = origin.map((o, a) => o + depth * d[a]), tau = va.tauAt(depth, alpha, scene.tracingProfile);
      records.push({ pixel, sample, eligibility: va.faceEligibility(scene.model, p, va.FACE_MARGIN_TAUS * tau, scene.effective.depth),
        normal: (halves[3] & 0x7fff) === 0 ? null : halves.slice(0, 3).map(mods.halfToNumber) });
    }
    return records;
  };
}
