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
import { createMaskWork } from './mask-work.js';
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
  return histogramMetrics(histogram, bits.length, samples);
}
function histogramMetrics(histogram, pixels, samples) {
  const m = { ...(samples === undefined ? {} : { samples }), pixels, hits: 0, nonMiss: 0, primaryUnresolved: 0, numericalFailures: 0, unavailableNormals: 0,
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
  return histogramReasons(histograms);
}
function histogramReasons(histograms) {
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

const CHUNK_PIXELS = 512;
const drain = steps => { let next; do { next = steps.next(); } while (!next.done); return next.value; };
const emptyCounts = () => ({ rayTermination: { hit: 0, miss: 0, numericalFailure: 0,
  unresolved: { pointBudget: 0, estimateUnavailable: 0, rayStepBudget: 0, stagnation: { rayParameter: 0, fieldCoordinate: 0 } } },
  unavailableNormals: 0, lightingFailures: { shadow: 0, ao: 0, both: 0 } });
const emptyRecovery = () => ({ attempts: 0, outcomes: zeros(RECOVERY_OUTCOME_LABELS), stops: zeros(RECOVERY_STOP_LABELS), midpoints: 0, encounters: 0 });

export function createOutcomeMasks({ width, height }, { recovery = false, producerToken = 0, strict = false, work = createMaskWork(), valid = () => true } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError('outcome masks need a positive integer size');
  if (!Number.isInteger(producerToken) || producerToken < 0 || producerToken > 0x7fffffff) throw new RangeError('invalid draft producer token');
  const expectedMarker = producerToken ? (producerToken * 2) >>> 0 : 0x41540000;
  const pixels = width * height, current = new Uint16Array(pixels), seen = new Uint8Array(pixels), union = new Uint16Array(pixels);
  const currentReasons = new Uint32Array(pixels), unionReasons = new Uint32Array(pixels);
  const COMPLETE = recovery ? 15 : 7;
  const currentRecovery = recovery ? new Uint32Array(pixels) : null, unionRecovery = recovery ? new Uint16Array(pixels) : null;
  const unionHistogram = new Uint32Array(512), unionReasonHistograms = REASON_CLASSES.map(() => new Uint32Array(64));
  const unionRecoveryHistogram = recovery ? new Uint32Array(512) : null;
  let key = null, open = null, closed = -1, samples = [], sampleReasons = [], sampleRecovery = [], cached = null;
  let completePixels = 0, counts = emptyCounts(), closedCounts = null;
  const zeroHistograms = () => {
    for (const h of [unionHistogram, ...unionReasonHistograms, ...(recovery ? [unionRecoveryHistogram] : [])]) { h.fill(0); h[0] = pixels; }
  };
  zeroHistograms();
  function* clearSteps(all = false) {
    const arrays = [current, seen, currentReasons, ...(recovery ? [currentRecovery] : []),
      ...(all ? [union, unionReasons, ...(recovery ? [unionRecovery] : [])] : [])];
    for (let i = 0; i < pixels; i += CHUNK_PIXELS) {
      const end = Math.min(pixels, i + CHUNK_PIXELS);
      for (const array of arrays) array.fill(0, i, end);
      yield end - i;
    }
  }
  function* resetSteps() {
    yield* clearSteps(true); zeroHistograms();
    key = null; open = null; closed = -1; samples = []; sampleReasons = []; sampleRecovery = []; cached = null;
    counts = emptyCounts(); closedCounts = null; completePixels = 0;
  }
  function* enter(id) {
    const { accumulationKey, sample } = id;
    if (typeof accumulationKey !== 'string' || !Number.isInteger(sample) || sample < 0) throw new TypeError('an outcome-mask identity is {accumulationKey, sample}');
    if (open !== null && accumulationKey === key && sample === open) return;
    if (open !== null) throw new RangeError(`stale outcome-mask identity ${accumulationKey}/${sample} while ${key}/${open} is open`);
    if (sample === 0 && accumulationKey === key && closed >= 0) throw new RangeError(`outcome-mask sample order: 0 repeated for ${key}`);
    if (sample === 0) {
      if (key !== null) yield* resetSteps(); // freshly allocated arrays already contain zeros
      key = accumulationKey;
    } else {
      if (accumulationKey !== key) throw new RangeError(`stale outcome-mask identity ${accumulationKey}/${sample}`);
      if (sample !== closed + 1) throw new RangeError(`outcome-mask sample order: ${sample} after ${closed}`);
    }
    open = sample; counts = emptyCounts(); completePixels = 0;
  }
  function statusAt(i, word, draft = false) {
    const status = word & 15, slot = reasonSlot((word >>> 4) & 15, (word >>> 8) & 15), rays = counts.rayTermination;
    if (status > RAY_STATUS.numericalFailure) throw new RangeError('invalid ray status in an outcome mask');
    if ((strict || draft) && status === RAY_STATUS.unresolved && slot === 5) throw new RangeError('invalid unresolved reason in a draft diagnostic or status readback');
    current[i] |= STATUS_BITS[status];
    if (status === 0) rays.hit++;
    else if (status === 1) rays.miss++;
    else if (status === 3) rays.numericalFailure++;
    else {
      currentReasons[i] |= 1 << slot;
      if (slot < 3) rays.unresolved[['pointBudget', 'estimateUnavailable', 'rayStepBudget'][slot]]++;
      else if (slot < 5) rays.unresolved.stagnation[slot === 3 ? 'rayParameter' : 'fieldCoordinate']++;
    }
    if (status === 0 && (seen[i] & FIELDS.normal.seen) && !(current[i] & NORMAL_RAW)) counts.unavailableNormals++;
  }
  function regionOf(region) {
    const { x, y, width: w, height: h } = region ?? {};
    if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > width || y + h > height) throw new RangeError('outcome-mask region outside the target');
    return { x, y, w, h };
  }
  function* recordSteps(id, field, region, bytes) {
    const layout = FIELDS[field];
    if (!layout) throw new RangeError(`unknown outcome-mask field ${field}`);
    if (field === 'recovery' && !recovery) throw new RangeError('recovery words are recorded only for a recovering family');
    const { x, y, w, h } = regionOf(region);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== w * h * layout.bytes) throw new RangeError(`outcome-mask ${field} bytes do not match the region`);
    yield* enter(id);
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), flag = layout.seen;
    let processed = 0;
    for (let row = 0, k = 0; row < h; row++) for (let i = (y + row) * width + x, end = i + w; i < end; i++, k++) {
      if (seen[i] & flag) throw new RangeError(`outcome-mask ${field} recorded twice for one pixel`);
      // Decode once: masks and renderer counts consume the same word/normal.
      if (field === 'normal') {
        const available = (data.getUint16(8 * k + 6, true) & 0x7fff) !== 0;
        if (available) current[i] |= NORMAL_RAW;
        else if ((seen[i] & FIELDS.status.seen) && (current[i] & B.hit)) counts.unavailableNormals++;
      } else {
        const word = data.getUint32(4 * k, true);
        if (field === 'recovery') currentRecovery[i] = word;
        else if (field === 'status') statusAt(i, word);
        else {
          const shadow = !!(word & LIGHTING_FAILURE_FLAGS.shadow), ao = !!(word & LIGHTING_FAILURE_FLAGS.ao);
          if (shadow) { counts.lightingFailures.shadow++; current[i] |= ((word >>> 2) & 3) === RAY_STATUS.numericalFailure ? B.shadowNumericalFailure : B.shadowUnresolved; }
          if (ao) { counts.lightingFailures.ao++; current[i] |= ((word >>> 12) & 3) === RAY_STATUS.numericalFailure ? B.aoNumericalFailure : B.aoUnresolved; }
          if (shadow && ao) counts.lightingFailures.both++;
          if (shadow && ((word >>> 2) & 3) === RAY_STATUS.unresolved) currentReasons[i] |= 1 << (8 + reasonSlot((word >>> 4) & 15, (word >>> 8) & 15));
          if (ao && ((word >>> 12) & 3) === RAY_STATUS.unresolved) currentReasons[i] |= 1 << (16 + reasonSlot((word >>> 14) & 15, (word >>> 18) & 15));
        }
      }
      seen[i] |= flag; if (seen[i] === COMPLETE) completePixels++;
      if (++processed % CHUNK_PIXELS === 0) yield CHUNK_PIXELS;
    }
    if (processed % CHUNK_PIXELS) yield processed % CHUNK_PIXELS;
  }
  function* draftSteps(id, region, bytes) {
    const { x, y, w, h } = regionOf(region), stride = recovery ? 12 : 8;
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== w * h * stride) throw new RangeError('draft diagnostic bytes do not match the region');
    yield* enter(id);
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let processed = 0;
    for (let row = 0, k = 0; row < h; row++) for (let i = (y + row) * width + x, end = i + w; i < end; i++, k += stride) {
      const word = data.getUint32(k, true), marker = data.getUint32(k + 4, true);
      if (((marker & 0xfffffffe) >>> 0) !== expectedMarker) throw new RangeError('missing or invalid draft diagnostic coverage');
      if (seen[i]) throw new RangeError('draft diagnostics recorded twice for one pixel');
      if (marker & 1) current[i] = NORMAL_RAW;
      seen[i] = FIELDS.normal.seen; statusAt(i, word, true);
      seen[i] = COMPLETE; completePixels++;
      if (recovery) currentRecovery[i] = data.getUint32(k + 8, true);
      if (++processed % CHUNK_PIXELS === 0) yield CHUNK_PIXELS;
    }
    if (processed % CHUNK_PIXELS) yield processed % CHUNK_PIXELS;
  }
  function* endSteps(id) {
    if (open === null || id?.accumulationKey !== key || id?.sample !== open) throw new RangeError('incomplete outcome-mask sample: no such open sample');
    if (completePixels !== pixels) throw new RangeError(`incomplete outcome-mask sample ${key}/${open}`);
    const histogram = new Uint32Array(512), reasons = REASON_CLASSES.map(() => new Uint32Array(64)), recovered = emptyRecovery();
    // One sliced pass validates pixels and accumulates both sample and union
    // histograms. snapshot() never visits a pixel or rebuilds these histograms.
    for (let i = 0; i < pixels; i++) {
      let v = current[i];
      if (v & B.hit && !(v & NORMAL_RAW)) v |= B.normalUnavailable;
      v &= ~NORMAL_RAW;
      if (recovery && currentRecovery[i]) {
        const w = currentRecovery[i], o = (w >>> 8) & 15, k = (w >>> 12) & 15, expected = OUTCOME_STATUS[o];
        const reasonBit = expected?.[1] ? 1 << (expected[1] - 1) : 0;
        if (w > 0xffff || !expected || !(v & expected[0]) || (reasonBit && !(currentReasons[i] & reasonBit)) || (k !== 0) !== (o === 4) || k > 4 || (w & 15) > RECOVERY_WORD.midpointLimit) throw new RangeError(`recovery word ${w} disagrees with the primary status at pixel ${i}`);
        const old = unionRecovery[i], next = old | 1 | (2 << (o - 1)) | (k ? 32 << (k - 1) : 0);
        unionRecoveryHistogram[old]--; unionRecoveryHistogram[next]++; unionRecovery[i] = next;
        recovered.attempts++; recovered.outcomes[RECOVERY_WORD.outcomes[o]]++; if (k) recovered.stops[RECOVERY_WORD.stops[k]]++;
        recovered.midpoints += w & 15; recovered.encounters += (w >>> 4) & 15;
      }
      histogram[v]++;
      const old = union[i], next = old | v;
      unionHistogram[old]--; unionHistogram[next]++; union[i] = next;
      const oldReasons = unionReasons[i], nextReasons = oldReasons | currentReasons[i];
      for (let c = 0; c < 3; c++) {
        reasons[c][(currentReasons[i] >>> (8 * c)) & 63]++;
        unionReasonHistograms[c][(oldReasons >>> (8 * c)) & 63]--;
        unionReasonHistograms[c][(nextReasons >>> (8 * c)) & 63]++;
      }
      unionReasons[i] = nextReasons;
      if ((i + 1) % CHUNK_PIXELS === 0) yield CHUNK_PIXELS;
    }
    if (pixels % CHUNK_PIXELS) yield pixels % CHUNK_PIXELS;
    const metrics = { sample: open, ...histogramMetrics(histogram, pixels) };
    samples.push(metrics); sampleReasons.push(histogramReasons(reasons));
    if (recovery) sampleRecovery.push({ sample: open, ...recovered });
    closedCounts = counts;
    // Clear in slices too: a whole 4K fill must not evade the task budget.
    yield* clearSteps();
    closed = open; open = null; completePixels = 0;
    let recoveryUnion = null;
    if (recovery) {
      recoveryUnion = { samples: samples.length, pixels, attempted: 0, outcomes: zeros(RECOVERY_OUTCOME_LABELS), stops: zeros(RECOVERY_STOP_LABELS) };
      for (let v = 1; v < 512; v++) {
        const n = unionRecoveryHistogram[v]; if (!n) continue;
        recoveryUnion.attempted += n;
        RECOVERY_OUTCOME_LABELS.forEach((label, c) => { if (v & (2 << c)) recoveryUnion.outcomes[label] += n; });
        RECOVERY_STOP_LABELS.forEach((label, c) => { if (v & (32 << c)) recoveryUnion.stops[label] += n; });
      }
    }
    cached = { accumulationKey: key, samples: samples.map(s => ({ ...s })), union: histogramMetrics(unionHistogram, pixels, samples.length),
      reasons: { samples: structuredClone(sampleReasons), union: histogramReasons(unionReasonHistograms) },
      recovery: recovery ? { samples: structuredClone(sampleRecovery), union: recoveryUnion } : null };
    return metrics;
  }
  // The final readback closes its sample before its scheduler lease completes;
  // therefore presentation admission can only observe fully validated metrics.
  function ingest(steps, id) {
    return work.run((function* () { yield* steps; if (completePixels === pixels) yield* endSteps(id); })(), valid);
  }
  return Object.freeze({
    width, height,
    record: (...args) => drain(recordSteps(...args)),
    recordDraft: (...args) => drain(draftSteps(...args)),
    recordAsync: (...args) => work.run(recordSteps(...args), valid),
    endAsync: id => work.run(endSteps(id), valid),
    ingest: (...args) => ingest(recordSteps(...args), args[0]),
    ingestDraft: (...args) => ingest(draftSteps(...args), args[0]),
    // Worker entry: retain the same decode/validation rules without main-thread
    // timers. The worker's message loop serializes complete readback operations.
    ingestSync(id, field, region, bytes) {
      drain(field === 'draftDiagnostics' ? draftSteps(id, region, bytes) : recordSteps(id, field, region, bytes));
      if (completePixels === pixels) drain(endSteps(id));
    },
    end: id => drain(endSteps(id)),
    closed: id => open === null && id.accumulationKey === key && id.sample === closed,
    counts: () => structuredClone(open === null ? closedCounts : counts),
    snapshot: () => structuredClone(cached),
    hitAt: index => (seen[index] & FIELDS.status.seen) !== 0 && (current[index] & B.hit) !== 0,
    statusSeen: index => (seen[index] & FIELDS.status.seen) !== 0,
    unionBits: () => union.slice(),
    unionReasons: () => unionReasons.slice(),
    reset: () => drain(resetSteps()),
  });
}
