// Outcome masks (plan rev 5.0 B11b; spec §8.1, §8.2): identity-, pixel- and sample-indexed status, normal and
// lighting masks retained from the renderer's completed readbacks. Each sample of one accumulation identity is
// recorded tile by tile (status, normal and lightingStatus readbacks in any order), closed by end(), and ORed into
// a pixelwise union over the same samples, so per-sample metrics and union metrics share one source: neither an
// aggregate count nor the last sample supplies a union denominator. Pure: no GPU or renderer state.
//
// Per-pixel bits. normalUnavailable is the joint mask "this sample hit and its normal is unavailable"; a miss or a
// failed primary ray never counts as an unavailable normal. Lighting bits come from B00's packLightingStatus words.
//
// Recovery (B11c; spec §11.4 rev 5.1): for a recovering family (`{recovery: true}`, quaternion Julia) each sample also
// records trace_band's recovery words. They are diagnostics kept apart from the terminal outcomes: per sample, the
// attempts, outcomes, stop details and the summed midpoints and point-budget encounters; over the union, the pixels
// that attempted recovery and that reached each outcome or stop in any sample. A word must agree with its pixel's
// terminal primary status (a recovered hit is a hit, a stopped recovery is a point-budget unresolved ray, and so on).
import { LIGHTING_FAILURE_FLAGS, RAY_STATUS, STATUS_LABELS } from './status.js';
import { RECOVERY_WORD } from './webgpu/passes.js';

export const OUTCOME_BITS = Object.freeze({ hit: 1, miss: 2, primaryUnresolved: 4, primaryNumericalFailure: 8, normalUnavailable: 16,
  shadowUnresolved: 32, shadowNumericalFailure: 64, aoUnresolved: 128, aoNumericalFailure: 256 });
const B = OUTCOME_BITS;
const STATUS_BITS = [B.hit, B.miss, B.primaryUnresolved, B.primaryNumericalFailure];
const NUMERICAL = B.primaryNumericalFailure | B.shadowNumericalFailure | B.aoNumericalFailure;
const FIELDS = Object.freeze({ status: { bytes: 4, seen: 1 }, normal: { bytes: 8, seen: 2 }, lightingStatus: { bytes: 4, seen: 4 }, recovery: { bytes: 4, seen: 8 } });
const NORMAL_RAW = 0x8000; // the raw availability of this sample's normal, folded into normalUnavailable at end()
const RECOVERY_OUTCOME_LABELS = RECOVERY_WORD.outcomes.slice(1), RECOVERY_STOP_LABELS = RECOVERY_WORD.stops.slice(1);
// The terminal primary status (and unresolved reason code) each recovery outcome must carry (index = outcome code).
const OUTCOME_STATUS = [null, [B.hit, 0], [B.primaryNumericalFailure, 0], [B.primaryUnresolved, 2], [B.primaryUnresolved, 1]];
const zeros = labels => Object.fromEntries(labels.map(label => [label, 0]));
// Metrics over one sample's recovery words.
export function recoveryMetrics(words) {
  const m = { attempts: 0, outcomes: zeros(RECOVERY_OUTCOME_LABELS), stops: zeros(RECOVERY_STOP_LABELS), midpoints: 0, encounters: 0 };
  for (let i = 0; i < words.length; i++) {
    const w = words[i]; if (!w) continue;
    const o = (w >>> 8) & 15, k = (w >>> 12) & 15;
    m.attempts++; m.outcomes[RECOVERY_WORD.outcomes[o]]++; if (k) m.stops[RECOVERY_WORD.stops[k]]++;
    m.midpoints += w & 15; m.encounters += (w >>> 4) & 15;
  }
  return m;
}
// Union bits per pixel: bit 0 attempted, bits 1–4 outcome codes 1–4, bits 5–8 stop codes 1–4.
export function recoveryUnionMetrics(bits, samples) {
  const m = { samples, pixels: bits.length, attempted: 0, outcomes: zeros(RECOVERY_OUTCOME_LABELS), stops: zeros(RECOVERY_STOP_LABELS) };
  for (let i = 0; i < bits.length; i++) {
    const v = bits[i]; if (!v) continue;
    m.attempted++;
    RECOVERY_OUTCOME_LABELS.forEach((label, c) => { if (v & (2 << c)) m.outcomes[label]++; });
    RECOVERY_STOP_LABELS.forEach((label, c) => { if (v & (32 << c)) m.stops[label]++; });
  }
  return m;
}

// Counts over one bit mask (a sample's, or the union's). Denominators: hits (unavailable normals and lighting) and
// nonMiss, the pixels with any non-miss primary outcome (primary unresolved). numericalFailures counts pixels with any
// primary or secondary numerical failure.
export function maskMetrics(bits, samples) {
  // One pass builds a histogram of the (9-bit) pixel values; the counts are read from its 512 entries.
  const histogram = new Uint32Array(512);
  for (let i = 0; i < bits.length; i++) histogram[bits[i] & 511]++;
  const m = { ...(samples === undefined ? {} : { samples }), pixels: bits.length, hits: 0, nonMiss: 0, primaryUnresolved: 0, numericalFailures: 0, unavailableNormals: 0,
    lightingUnresolved: 0, shadowUnresolved: 0, aoUnresolved: 0, lightingNumericalFailures: 0 };
  for (let v = 0; v < 512; v++) {
    const n = histogram[v]; if (!n) continue;
    if (v & B.hit) m.hits += n;
    if (v & (B.hit | B.primaryUnresolved | B.primaryNumericalFailure)) m.nonMiss += n;
    if (v & B.primaryUnresolved) m.primaryUnresolved += n;
    if (v & NUMERICAL) m.numericalFailures += n;
    if (v & B.normalUnavailable) m.unavailableNormals += n;
    if (v & (B.shadowUnresolved | B.aoUnresolved)) m.lightingUnresolved += n;
    if (v & B.shadowUnresolved) m.shadowUnresolved += n;
    if (v & B.aoUnresolved) m.aoUnresolved += n;
    if (v & (B.shadowNumericalFailure | B.aoNumericalFailure)) m.lightingNumericalFailures += n;
  }
  return m;
}

// Reasons (B11b fix round 1, Codex B11b-F2): every unresolved primary, shadow and AO outcome keeps its reason and
// subreason, as one bit per reason in an 8-bit lane per pixel class (primary bits 0-5, shadow 8-13, AO 16-21), so a
// pixel that fails for different reasons in different samples keeps each of them in the union. Numerical failures
// carry no reason. Slot 5 ('unspecified') holds any other reason code, which the B00 contract never produces.
export const REASON_SLOTS = Object.freeze([...STATUS_LABELS.reason.slice(1, 4), ...STATUS_LABELS.subreason.slice(1).map(s => `stagnation/${s}`), 'unspecified']);
export const REASON_CLASSES = Object.freeze(['primaryUnresolved', 'shadowUnresolved', 'aoUnresolved']);
const reasonSlot = (reason, subreason) => (reason >= 1 && reason <= 3 ? reason - 1 : reason === 4 && (subreason === 1 || subreason === 2) ? 2 + subreason : 5);
// Pixels per reason in each class; `multiple` counts pixels with more than one reason (only possible in a union).
export function reasonMetrics(lanes) {
  const histograms = REASON_CLASSES.map(() => new Uint32Array(64));
  for (let i = 0; i < lanes.length; i++) {
    const v = lanes[i]; if (!v) continue;
    histograms[0][v & 63]++; histograms[1][(v >>> 8) & 63]++; histograms[2][(v >>> 16) & 63]++;
  }
  return Object.fromEntries(REASON_CLASSES.map((name, c) => {
    const out = Object.fromEntries([...REASON_SLOTS, 'multiple'].map(label => [label, 0]));
    for (let v = 1; v < 64; v++) {
      const n = histograms[c][v]; if (!n) continue;
      REASON_SLOTS.forEach((label, k) => { if (v & (1 << k)) out[label] += n; });
      if (v & (v - 1)) out.multiple += n;
    }
    return [name, out];
  }));
}

export function createOutcomeMasks({ width, height }, { recovery = false } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError('outcome masks need a positive integer size');
  const pixels = width * height, current = new Uint16Array(pixels), seen = new Uint8Array(pixels), union = new Uint16Array(pixels);
  const currentReasons = new Uint32Array(pixels), unionReasons = new Uint32Array(pixels);
  const COMPLETE = recovery ? 15 : 7;
  const currentRecovery = recovery ? new Uint32Array(pixels) : null, unionRecovery = recovery ? new Uint16Array(pixels) : null;
  let key = null, open = null, closed = -1, samples = [], sampleReasons = [], sampleRecovery = [];
  function clear() { current.fill(0); seen.fill(0); currentReasons.fill(0); currentRecovery?.fill(0); }
  function reset() { clear(); union.fill(0); unionReasons.fill(0); unionRecovery?.fill(0); key = null; open = null; closed = -1; samples = []; sampleReasons = []; sampleRecovery = []; }
  function enter({ accumulationKey, sample }) {
    if (typeof accumulationKey !== 'string' || !Number.isInteger(sample) || sample < 0) throw new TypeError('an outcome-mask identity is {accumulationKey, sample}');
    if (open !== null && accumulationKey === key && sample === open) return;
    if (open !== null) throw new RangeError(`stale outcome-mask identity ${accumulationKey}/${sample} while ${key}/${open} is open`);
    // Sample 0 starts a new accumulation identity; repeating it within the same identity is an order error.
    if (sample === 0 && accumulationKey === key && closed >= 0) throw new RangeError(`outcome-mask sample order: 0 repeated for ${key}`);
    if (sample === 0) { reset(); key = accumulationKey; open = 0; return; }
    if (accumulationKey !== key) throw new RangeError(`stale outcome-mask identity ${accumulationKey}/${sample}`);
    if (sample !== closed + 1) throw new RangeError(`outcome-mask sample order: ${sample} after ${closed}`);
    open = sample;
  }
  return Object.freeze({
    width, height,
    // One completed readback tile of `field` for the sample `id`.
    record(id, field, region, bytes) {
      const layout = FIELDS[field];
      if (!layout) throw new RangeError(`unknown outcome-mask field ${field}`);
      if (field === 'recovery' && !recovery) throw new RangeError('recovery words are recorded only for a recovering family');
      enter(id);
      const { x, y, width: w, height: h } = region ?? {};
      if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > width || y + h > height) throw new RangeError('outcome-mask region outside the target');
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== w * h * layout.bytes) throw new RangeError(`outcome-mask ${field} bytes do not match the region`);
      // Little-endian typed views (copied when the bytes are unaligned); one loop per field.
      const aligned = bytes.byteOffset % 4 === 0 ? bytes : bytes.slice();
      const flag = layout.seen;
      if (field === 'normal') {
        const halves = new Uint16Array(aligned.buffer, aligned.byteOffset, w * h * 4);
        for (let row = 0, k = 3; row < h; row++) for (let i = (y + row) * width + x, end = i + w; i < end; i++, k += 4) {
          if (seen[i] & flag) throw new RangeError('outcome-mask normal recorded twice for one pixel');
          seen[i] |= flag;
          if (halves[k] & 0x7fff) current[i] |= NORMAL_RAW;
        }
      } else {
        const words = new Uint32Array(aligned.buffer, aligned.byteOffset, w * h);
        for (let row = 0, k = 0; row < h; row++) for (let i = (y + row) * width + x, end = i + w; i < end; i++, k++) {
          if (seen[i] & flag) throw new RangeError(`outcome-mask ${field} recorded twice for one pixel`);
          seen[i] |= flag;
          const word = words[k];
          if (field === 'recovery') { currentRecovery[i] = word; continue; }
          if (field === 'status') {
            const status = word & 15;
            if (status > RAY_STATUS.numericalFailure) throw new RangeError('invalid ray status in an outcome mask');
            current[i] |= STATUS_BITS[status];
            if (status === RAY_STATUS.unresolved) currentReasons[i] |= 1 << reasonSlot((word >>> 4) & 15, (word >>> 8) & 15);
          } else {
            // B00 packLightingStatus: shadow flag bit 0, status at bit 2; AO flag bit 1, status at bit 12.
            if (word & LIGHTING_FAILURE_FLAGS.shadow) current[i] |= ((word >>> 2) & 3) === RAY_STATUS.numericalFailure ? B.shadowNumericalFailure : B.shadowUnresolved;
            if (word & LIGHTING_FAILURE_FLAGS.ao) current[i] |= ((word >>> 12) & 3) === RAY_STATUS.numericalFailure ? B.aoNumericalFailure : B.aoUnresolved;
            // Reason at status shift + 2, subreason at + 6 (shadow shift 2, AO shift 12).
            if (word & LIGHTING_FAILURE_FLAGS.shadow && ((word >>> 2) & 3) === RAY_STATUS.unresolved) currentReasons[i] |= 1 << (8 + reasonSlot((word >>> 4) & 15, (word >>> 8) & 15));
            if (word & LIGHTING_FAILURE_FLAGS.ao && ((word >>> 12) & 3) === RAY_STATUS.unresolved) currentReasons[i] |= 1 << (16 + reasonSlot((word >>> 14) & 15, (word >>> 18) & 15));
          }
        }
      }
    },
    // Draft-only packet v1: [terminal status, coverage marker | normal availability,
    // optional quaternion recovery word]. Direct/diagnostic shade evaluates no
    // secondary rays; its lighting flags are therefore exactly zero, not missing.
    recordDraft(id, region, bytes) {
      const { x, y, width: w, height: h } = region ?? {}, stride = recovery ? 12 : 8;
      if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > width || y + h > height) throw new RangeError('outcome-mask region outside the target');
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== w * h * stride) throw new RangeError('draft diagnostic bytes do not match the region');
      enter(id);
      const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let row = 0, k = 0; row < h; row++) for (let i = (y + row) * width + x, end = i + w; i < end; i++, k += stride) {
        const word = data.getUint32(k, true), marker = data.getUint32(k + 4, true), status = word & 15;
        if ((marker & 0xfffffffe) !== 0x41540000) throw new RangeError('missing or invalid draft diagnostic coverage');
        if (status > RAY_STATUS.numericalFailure) throw new RangeError('invalid ray status in a draft diagnostic');
        if (seen[i]) throw new RangeError('draft diagnostics recorded twice for one pixel');
        seen[i] = COMPLETE; current[i] = STATUS_BITS[status] | ((marker & 1) ? NORMAL_RAW : 0);
        if (status === RAY_STATUS.unresolved) currentReasons[i] = 1 << reasonSlot((word >>> 4) & 15, (word >>> 8) & 15);
        if (recovery) currentRecovery[i] = data.getUint32(k + 8, true);
      }
    },
    // Whether this sample's status at a pixel was recorded and is a hit (for the joint normal count).
    hitAt(index) { return (seen[index] & FIELDS.status.seen) !== 0 && (current[index] & B.hit) !== 0; },
    statusSeen(index) { return (seen[index] & FIELDS.status.seen) !== 0; },
    // Close the sample: every pixel must have all three fields. Returns the sample's metrics and ORs it into the union.
    end(id) {
      if (open === null || id?.accumulationKey !== key || id?.sample !== open) throw new RangeError('incomplete outcome-mask sample: no such open sample');
      for (let i = 0; i < pixels; i++) {
        if (seen[i] !== COMPLETE) throw new RangeError(`incomplete outcome-mask sample ${key}/${open} at pixel ${i}`);
        let v = current[i];
        if (v & B.hit && !(v & NORMAL_RAW)) v |= B.normalUnavailable;
        current[i] = v & ~NORMAL_RAW;
        if (recovery && currentRecovery[i]) {
          const w = currentRecovery[i], o = (w >>> 8) & 15, k = (w >>> 12) & 15, expected = OUTCOME_STATUS[o];
          const reasonBit = expected?.[1] ? 1 << (expected[1] - 1) : 0;
          if (w > 0xffff || !expected || !(current[i] & expected[0]) || (reasonBit && !(currentReasons[i] & reasonBit)) || (k !== 0) !== (o === 4) || k > 4 || (w & 15) > RECOVERY_WORD.midpointLimit) {
            throw new RangeError(`recovery word ${w} disagrees with the primary status at pixel ${i}`);
          }
          unionRecovery[i] |= 1 | (2 << (o - 1)) | (k ? 32 << (k - 1) : 0);
        }
        union[i] |= current[i];
        unionReasons[i] |= currentReasons[i];
      }
      const metrics = { sample: open, ...maskMetrics(current) };
      samples.push(metrics); sampleReasons.push(reasonMetrics(currentReasons));
      if (recovery) sampleRecovery.push({ sample: open, ...recoveryMetrics(currentRecovery) });
      closed = open; open = null; clear();
      return metrics;
    },
    snapshot() {
      if (key === null || !samples.length) return null;
      return { accumulationKey: key, samples: samples.map(s => ({ ...s })), union: maskMetrics(union, samples.length), reasons: { samples: structuredClone(sampleReasons), union: reasonMetrics(unionReasons) },
        recovery: recovery ? { samples: structuredClone(sampleRecovery), union: recoveryUnionMetrics(unionRecovery, samples.length) } : null };
    },
    unionBits() { return union.slice(); },
    unionReasons() { return unionReasons.slice(); },
    reset,
  });
}
