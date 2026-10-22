// Visual acceptance (plan rev 5.0 B11b; user decisions 2026-10-22): the frozen six-scene fixture, the thresholds,
// and the measurement helpers the headed check uses. Pure Node: no browser or GPU.
//
// Masks are independent of the renderer's: VA_BITS is this file's own per-pixel layout, filled in the page from
// the renderer's raw status, normal and lightingStatus readbacks. Union metrics are pixelwise ORs over the same
// samples of one accumulation; the denominators are the pixels with any primary hit (normals, lighting) or with
// any non-miss primary outcome (primary unresolved), and every numerator and denominator is reported.
import { readFileSync } from 'node:fs';
import { boxLocal, ROTATED_BOX } from '../reference/analytic.js';
import { mengerDistance } from '../reference/menger.js';
import { RECOVERY_WORD, decodeRecoveryWord } from '../../src/space/render/webgpu/passes.js';

export const VISUAL_FIXTURE_PATH = 'tests/fixtures/visual-acceptance.json';
export const loadVisualFixture = () => JSON.parse(readFileSync(VISUAL_FIXTURE_PATH, 'utf8'));
export const VISUAL_ACCEPTANCE_PASS = 'Six frozen scenes meet visual acceptance';

export const VA_BITS = Object.freeze({ hit: 1, miss: 2, unresolved: 4, numerical: 8, normalUnavailable: 16, shadowUnresolved: 32, shadowNumerical: 64, aoUnresolved: 128, aoNumerical: 256 });
// New post-discovery product thresholds (plan B11b table), never performance or numerical tolerances.
export const VISUAL_THRESHOLDS = Object.freeze({
  analytic: Object.freeze({ primaryUnresolved: 0, numericalFailures: 0, unavailableNormals: 0.001, lightingUnresolved: 0.01, lightingAsMagenta: 0, lostIndication: 0 }),
  fractal: Object.freeze({ primaryUnresolved: 0.001, numericalFailures: 0, unavailableNormals: 0.01, lightingUnresolved: 0.10, lightingAsMagenta: 0, lostIndication: 0 }),
});
export const FACE_NORMAL_CRITERION = Object.freeze({ maxRadians: 1e-3, minFraction: 0.99, unavailableAllowed: 0 });
// Eligibility margin, fixed before any comparison: a face-interior hit lies farther than FACE_MARGIN_TAUS·τ(t) from
// every edge of its face (the stencil reaches ε = 0.5τ and the hit stops within τ of the surface).
export const FACE_MARGIN_TAUS = 4;

// Per-pixel bits of one sample from its decoded words (the page applies the same rule to raw readbacks).
export function sampleBits({ status, normalAvailable, shadow, ao }) {
  let v = [VA_BITS.hit, VA_BITS.miss, VA_BITS.unresolved, VA_BITS.numerical][status];
  if (status === 0 && !normalAvailable) v |= VA_BITS.normalUnavailable;
  if (shadow) v |= shadow === 'numerical' ? VA_BITS.shadowNumerical : VA_BITS.shadowUnresolved;
  if (ao) v |= ao === 'numerical' ? VA_BITS.aoNumerical : VA_BITS.aoUnresolved;
  return v;
}
export function orBits(list) {
  const out = new Uint16Array(list[0].length);
  for (const bits of list) for (let i = 0; i < out.length; i++) out[i] |= bits[i];
  return out;
}
// Reasons (B11b fix round 1), this file's own layout. The page codes each unresolved outcome of one sample as
// 1 point-budget, 2 estimate-unavailable, 3 ray-step-budget, 4 stagnation/ray-parameter, 5 stagnation/field-coordinate
// or 6 unspecified, in 3 bits per class (primary 0-2, shadow 3-5, AO 6-8), and sends [pixel, codes] pairs for the
// pixels with any code. Lanes hold one bit per reason, 8 bits per class, so a union keeps every reason of a pixel.
export const VA_REASON_LABELS = Object.freeze(['point-budget', 'estimate-unavailable', 'ray-step-budget', 'stagnation/ray-parameter', 'stagnation/field-coordinate', 'unspecified']);
const VA_REASON_CLASSES = ['primaryUnresolved', 'shadowUnresolved', 'aoUnresolved'];
export const vaReasonCode = (reason, subreason) => (reason >= 1 && reason <= 3 ? reason : reason === 4 && (subreason === 1 || subreason === 2) ? 3 + subreason : 6);
export function vaReasonLanes(pairs, pixels) {
  const lanes = new Uint32Array(pixels);
  for (let k = 0; k < pairs.length; k += 2) {
    const codes = pairs[k + 1];
    for (let c = 0; c < 3; c++) { const code = (codes >>> (3 * c)) & 7; if (code) lanes[pairs[k]] |= 1 << (8 * c + code - 1); }
  }
  return lanes;
}
export function orBits32(list) {
  const out = new Uint32Array(list[0].length);
  for (const bits of list) for (let i = 0; i < out.length; i++) out[i] |= bits[i];
  return out;
}
export function vaReasonMetrics(lanes) {
  const out = Object.fromEntries(VA_REASON_CLASSES.map(name => [name, Object.fromEntries([...VA_REASON_LABELS, 'multiple'].map(label => [label, 0]))]));
  for (const v of lanes) {
    if (!v) continue;
    VA_REASON_CLASSES.forEach((name, c) => {
      const lane = (v >>> (8 * c)) & 255; if (!lane) return;
      VA_REASON_LABELS.forEach((label, k) => { if (lane & (1 << k)) out[name][label]++; });
      if (lane & (lane - 1)) out[name].multiple++;
    });
  }
  return out;
}
// Recovery (B11c; spec §11.4 rev 5.1), this file's own reading of the raw recovery words: each sample's [pixel, word]
// pairs (nonzero words only) decode with passes.js decodeRecoveryWord; per sample the attempts, outcomes, stops and the
// summed midpoints and encounters; over the union of the same samples, the pixels with an attempt and with each outcome
// or stop in any sample.
export function vaRecoveryMetrics(frames, pixels) {
  const outcomes = RECOVERY_WORD.outcomes.slice(1), stops = RECOVERY_WORD.stops.slice(1);
  const zero = labels => Object.fromEntries(labels.map(label => [label, 0]));
  const seen = new Map(), perSample = frames.map((pairs, sample) => {
    const m = { sample, attempts: 0, outcomes: zero(outcomes), stops: zero(stops), midpoints: 0, encounters: 0 };
    for (let k = 0; k < pairs.length; k += 2) {
      const pixel = pairs[k], r = decodeRecoveryWord(pairs[k + 1]);
      if (!r.attempted) throw new RangeError('a recovery pair without an attempt');
      m.attempts++; m.outcomes[r.outcome]++; if (r.stop !== 'none') m.stops[r.stop]++; m.midpoints += r.midpoints; m.encounters += r.encounters;
      const entry = seen.get(pixel) ?? { outcomes: new Set(), stops: new Set() };
      entry.outcomes.add(r.outcome); if (r.stop !== 'none') entry.stops.add(r.stop); seen.set(pixel, entry);
    }
    return m;
  });
  const union = { samples: frames.length, pixels, attempted: seen.size, outcomes: zero(outcomes), stops: zero(stops) };
  for (const entry of seen.values()) { for (const o of entry.outcomes) union.outcomes[o]++; for (const k of entry.stops) union.stops[k]++; }
  return { samples: perSample, union };
}
// The one-sided stencil direction check (Codex B11b-F4): an available normal must have finite, nonzero components
// and a finite angle within `limit` of the prediction. Returns null, or {reason, angle}. (`angle > limit` alone is
// false for NaN.)
export function stencilDirectionError(normal, expected, limit) {
  const finite = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  if (!finite(normal)) return { reason: 'non-finite normal', angle: NaN };
  if (!(Math.hypot(...normal) > 0)) return { reason: 'zero normal', angle: NaN };
  const angle = finite(expected) ? angleBetween(normal, expected) : NaN;
  if (!Number.isFinite(angle)) return { reason: 'non-finite angle', angle };
  return angle <= limit ? null : { reason: 'angle over the limit', angle };
}
const isMagenta = got => got[0] === 255 && got[1] === 0 && got[2] === 255;
// One flagged pixel of the full shaded image (Codex B11b-F5): `lost` when it differs from its expected display (or,
// lighting-only, is not visibly tinted); `magenta` when a lighting-only pixel shows primary magenta, counted
// independently of `lost`; `tinted` when a lighting-only pixel shows its visible tint.
export function classifyFlaggedPixel({ got, expected, plain, lightingOnly }) {
  const mismatch = expected.some((v, k) => Math.abs(v - got[k]) > 1);
  if (!lightingOnly) return { lost: mismatch, magenta: false, tinted: false };
  const magenta = isMagenta(got), invisible = Math.max(...plain.map((v, k) => Math.abs(v - got[k]))) < 2;
  const lost = mismatch || magenta || invisible;
  return { lost, magenta, tinted: !lost };
}
// Numerators and denominators over one bit mask.
export function vaMetrics(bits) {
  const B = VA_BITS, m = { pixels: bits.length, hits: 0, nonMiss: 0, primaryUnresolved: 0, numericalFailures: 0, unavailableNormals: 0, lightingUnresolved: 0, shadowUnresolved: 0, aoUnresolved: 0, lightingNumericalFailures: 0 };
  for (const v of bits) {
    const hit = (v & B.hit) !== 0;
    if (hit) m.hits++;
    if (v & (B.hit | B.unresolved | B.numerical)) m.nonMiss++;
    if (v & B.unresolved) m.primaryUnresolved++;
    if (v & (B.numerical | B.shadowNumerical | B.aoNumerical)) m.numericalFailures++;
    if (v & B.normalUnavailable) m.unavailableNormals++;
    if (v & (B.shadowUnresolved | B.aoUnresolved)) m.lightingUnresolved++;
    if (v & B.shadowUnresolved) m.shadowUnresolved++;
    if (v & B.aoUnresolved) m.aoUnresolved++;
    if (v & (B.shadowNumerical | B.aoNumerical)) m.lightingNumericalFailures++;
  }
  return m;
}
const fraction = (n, d) => (d ? n / d : 0);
// The threshold rows of one scene from union metrics and the presentation counts.
export function evaluateScene({ sceneClass, union, lightingAsMagenta, lostIndication }) {
  const limits = VISUAL_THRESHOLDS[sceneClass];
  if (!limits) throw new RangeError(`unknown scene class ${sceneClass}`);
  const rows = [
    { metric: 'primaryUnresolved', numerator: union.primaryUnresolved, denominator: union.nonMiss },
    { metric: 'numericalFailures', numerator: union.numericalFailures, denominator: union.nonMiss },
    { metric: 'unavailableNormals', numerator: union.unavailableNormals, denominator: union.hits },
    { metric: 'lightingUnresolved', numerator: union.lightingUnresolved, denominator: union.hits },
    { metric: 'lightingAsMagenta', numerator: lightingAsMagenta, denominator: union.hits },
    { metric: 'lostIndication', numerator: lostIndication, denominator: union.pixels },
  ].map(row => {
    const limit = limits[row.metric], value = fraction(row.numerator, row.denominator);
    // A zero limit is a count (zero pixels); a nonzero limit is a fraction of its denominator.
    return { ...row, fraction: value, limit, passed: limit === 0 ? row.numerator === 0 : value <= limit };
  });
  return { rows, passed: rows.every(row => row.passed) };
}

// ---- smooth-face eligibility and analytic normals (binary64 references, tests/reference) -------------------
const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = v => { const n = Math.hypot(...v); return v.map(x => x / n); };
export function angleBetween(a, b) {
  const u = unit(a), v = unit(b), d = Math.min(1, Math.max(-1, dot(u, v)));
  // Small angles: |u × v| is better conditioned than acos near 1.
  const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return Math.atan2(Math.hypot(...c), d);
}
// {eligible, normal, reason}: whether p (a hit, within τ outside the surface) lies on a smooth face interior with
// every edge farther than margin, and the analytic outward normal there. Decided from geometry only.
export function faceEligibility(model, p, margin, depth) {
  if (model === 'sphere') {
    const r = Math.hypot(...p);
    return r > 0 ? { eligible: true, normal: p.map(x => x / r) } : { eligible: false, reason: 'centre' };
  }
  if (model === 'box') {
    const local = boxLocal(p, ROTATED_BOX), q = local.map((v, i) => Math.abs(v) - ROTATED_BOX.half[i]);
    const axis = q.indexOf(Math.max(...q));
    if (!(q[axis] >= 0)) return { eligible: false, reason: 'inside' };
    for (let b = 0; b < 3; b++) if (b !== axis && !(-q[b] > margin)) return { eligible: false, reason: 'edge' };
    const n = [0, 0, 0]; n[axis] = Math.sign(local[axis]);
    const c = Math.cos(ROTATED_BOX.rotationZ), s = Math.sin(ROTATED_BOX.rotationZ);
    return { eligible: true, normal: [c * n[0] - s * n[1], s * n[0] + c * n[1], n[2]], axis };
  }
  if (model === 'menger') {
    // Lattice planes x = -1 + k·h, h = 2/3^depth: every face of the finite union lies on one.
    const h = 2 / 3 ** depth, near = p.map(v => { const k = Math.round((v + 1) / h); return { plane: -1 + k * h, k, delta: Math.abs(v - (-1 + k * h)) }; });
    const axis = [0, 1, 2].reduce((best, a) => (near[a].delta < near[best].delta ? a : best), 0);
    for (let b = 0; b < 3; b++) if (b !== axis && !(near[b].delta > margin)) return { eligible: false, reason: 'edge' };
    const reference = mengerDistance(p, depth);
    if (reference.applicability !== 'exterior') return { eligible: false, reason: reference.applicability ?? 'failure' };
    // The nearest surface must be that plane's face: its exact union distance equals the plane distance.
    if (!(Math.abs(reference.distance - near[axis].delta) <= 1e-9 * Math.max(1, reference.distance))) return { eligible: false, reason: 'competing-feature' };
    if (!(near[axis].delta > 0)) return { eligible: false, reason: 'on-plane' };
    const n = [0, 0, 0]; n[axis] = Math.sign(p[axis] - near[axis].plane);
    return { eligible: true, normal: n, axis };
  }
  throw new RangeError(`no analytic faces for ${model}`);
}
export const tauAt = (t, alpha, profile = { toleranceFloor: 1e-6, toleranceFactor: 0.5 }) => Math.max(profile.toleranceFloor, profile.toleranceFactor * alpha * t);
// One sample's face-normal tally from compact hit records {t, normal|null} and their world points.
export function faceNormalTally(records) {
  const out = { hits: records.length, eligible: 0, unavailable: 0, withinLimit: 0, maxRadians: 0, reasons: {}, worst: [] };
  for (const r of records) {
    if (!r.eligibility.eligible) { out.reasons[r.eligibility.reason] = (out.reasons[r.eligibility.reason] ?? 0) + 1; continue; }
    out.eligible++;
    if (!r.normal) { out.unavailable++; if (out.worst.length < 8) out.worst.push({ pixel: r.pixel, sample: r.sample, unavailable: true }); continue; }
    const angle = angleBetween(r.normal, r.eligibility.normal);
    if (angle <= FACE_NORMAL_CRITERION.maxRadians) out.withinLimit++;
    else if (out.worst.length < 8) out.worst.push({ pixel: r.pixel, sample: r.sample, radians: angle });
    out.maxRadians = Math.max(out.maxRadians, angle);
  }
  return out;
}
export function mergeTallies(list) {
  const out = { hits: 0, eligible: 0, unavailable: 0, withinLimit: 0, maxRadians: 0, reasons: {}, worst: [] };
  for (const t of list) {
    for (const key of ['hits', 'eligible', 'unavailable', 'withinLimit']) out[key] += t[key];
    out.maxRadians = Math.max(out.maxRadians, t.maxRadians);
    for (const [k, v] of Object.entries(t.reasons)) out.reasons[k] = (out.reasons[k] ?? 0) + v;
    out.worst.push(...t.worst.slice(0, Math.max(0, 8 - out.worst.length)));
  }
  out.fractionWithinLimit = out.eligible ? out.withinLimit / out.eligible : 0;
  out.passed = out.eligible > 0 && out.unavailable === FACE_NORMAL_CRITERION.unavailableAllowed && out.fractionWithinLimit >= FACE_NORMAL_CRITERION.minFraction;
  return out;
}

// ---- the one-sided normal stencil (plan rev 5.0 B10 note), predicted in binary64 for box and Menger ----------
// Each sample position is classified exterior (with its exact distance), interior, or ambiguous within `tol` of
// the surface; the prediction follows normals.wgsl: central where both endpoints are exterior, one-sided against the
// centre value where exactly one is interior, unavailable where both are (or the needed centre is interior).
function classify(model, q, depth, tol) {
  if (model === 'box') {
    const local = boxLocal(q, ROTATED_BOX), d = local.map((v, i) => Math.abs(v) - ROTATED_BOX.half[i]), m = Math.max(...d);
    if (m > tol) return { kind: 'exterior', distance: Math.hypot(...d.map(v => Math.max(v, 0))) };
    return m < -tol ? { kind: 'interior' } : { kind: 'ambiguous' };
  }
  const r = mengerDistance(q, depth), h = 2 / 3 ** depth;
  if (r.distance > tol) return { kind: 'exterior', distance: r.distance };
  if (r.distance > 0 || r.applicability !== 'interior') return { kind: 'ambiguous' };
  const nearPlane = q.some(v => Math.abs(v + 1 - Math.round((v + 1) / h) * h) <= tol);
  return nearPlane ? { kind: 'ambiguous' } : { kind: 'interior' };
}
export function predictStencilNormal(model, p, eps, depth, tol = 1e-4) {
  const gradient = [0, 0, 0], modes = [];
  let centre = null;
  for (let axis = 0; axis < 3; axis++) {
    const plus = p.map((v, i) => v + (i === axis ? eps : 0)), minus = p.map((v, i) => v - (i === axis ? eps : 0));
    const a = classify(model, plus, depth, tol), b = classify(model, minus, depth, tol);
    if (a.kind === 'ambiguous' || b.kind === 'ambiguous') return { expected: 'ambiguous' };
    if (a.kind === 'exterior' && b.kind === 'exterior') { gradient[axis] = (a.distance - b.distance) / (2 * eps); modes.push('central'); continue; }
    if (a.kind === 'interior' && b.kind === 'interior') return { expected: 'unavailable', reason: 'both-interior', modes: [...modes, 'both-interior'] };
    centre ??= classify(model, p, depth, tol);
    if (centre.kind === 'ambiguous') return { expected: 'ambiguous' };
    if (centre.kind !== 'exterior') return { expected: 'unavailable', reason: 'centre-interior', modes: [...modes, 'centre-interior'] };
    if (a.kind === 'exterior') { gradient[axis] = (a.distance - centre.distance) / eps; modes.push('forward'); }
    else { gradient[axis] = (centre.distance - b.distance) / eps; modes.push('backward'); }
  }
  const length = Math.hypot(...gradient);
  if (!(length > 1e-6)) return { expected: 'ambiguous' };
  return { expected: 'available', normal: gradient.map(v => v / length), modes };
}
