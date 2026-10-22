// Outcome masks (plan rev 5.0 B11b; spec §8.1, §8.2): identity-, pixel- and sample-indexed status, normal and
// lighting masks retained from the renderer's completed readbacks. Each sample of one accumulation identity is
// recorded tile by tile (status, normal and lightingStatus readbacks in any order), closed by end(), and ORed into
// a pixelwise union over the same samples, so per-sample metrics and union metrics share one source: neither an
// aggregate count nor the last sample supplies a union denominator. Pure: no GPU or renderer state.
//
// Per-pixel bits. normalUnavailable is the joint mask "this sample hit and its normal is unavailable"; a miss or a
// failed primary ray never counts as an unavailable normal. Lighting bits come from B00's packLightingStatus words.
import { LIGHTING_FAILURE_FLAGS, RAY_STATUS } from './status.js';

export const OUTCOME_BITS = Object.freeze({ hit: 1, miss: 2, primaryUnresolved: 4, primaryNumericalFailure: 8, normalUnavailable: 16,
  shadowUnresolved: 32, shadowNumericalFailure: 64, aoUnresolved: 128, aoNumericalFailure: 256 });
const B = OUTCOME_BITS;
const STATUS_BITS = [B.hit, B.miss, B.primaryUnresolved, B.primaryNumericalFailure];
const NUMERICAL = B.primaryNumericalFailure | B.shadowNumericalFailure | B.aoNumericalFailure;
const FIELDS = Object.freeze({ status: { bytes: 4, seen: 1 }, normal: { bytes: 8, seen: 2 }, lightingStatus: { bytes: 4, seen: 4 } });
const COMPLETE = 7, NORMAL_RAW = 0x8000; // the raw availability of this sample's normal, folded into normalUnavailable at end()

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

export function createOutcomeMasks({ width, height }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError('outcome masks need a positive integer size');
  const pixels = width * height, current = new Uint16Array(pixels), seen = new Uint8Array(pixels), union = new Uint16Array(pixels);
  let key = null, open = null, closed = -1, samples = [];
  function clear() { current.fill(0); seen.fill(0); }
  function reset() { clear(); union.fill(0); key = null; open = null; closed = -1; samples = []; }
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
      enter(id);
      const layout = FIELDS[field];
      if (!layout) throw new RangeError(`unknown outcome-mask field ${field}`);
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
          if (field === 'status') {
            const status = word & 15;
            if (status > RAY_STATUS.numericalFailure) throw new RangeError('invalid ray status in an outcome mask');
            current[i] |= STATUS_BITS[status];
          } else {
            // B00 packLightingStatus: shadow flag bit 0, status at bit 2; AO flag bit 1, status at bit 12.
            if (word & LIGHTING_FAILURE_FLAGS.shadow) current[i] |= ((word >>> 2) & 3) === RAY_STATUS.numericalFailure ? B.shadowNumericalFailure : B.shadowUnresolved;
            if (word & LIGHTING_FAILURE_FLAGS.ao) current[i] |= ((word >>> 12) & 3) === RAY_STATUS.numericalFailure ? B.aoNumericalFailure : B.aoUnresolved;
          }
        }
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
        union[i] |= current[i];
      }
      const metrics = { sample: open, ...maskMetrics(current) };
      samples.push(metrics); closed = open; open = null; clear();
      return metrics;
    },
    snapshot() {
      if (key === null || !samples.length) return null;
      return { accumulationKey: key, samples: samples.map(s => ({ ...s })), union: maskMetrics(union, samples.length) };
    },
    unionBits() { return union.slice(); },
    reset,
  });
}
