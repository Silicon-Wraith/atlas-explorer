// REC-G integer ABI. No per-pixel masks are reconstructed or claimed by this summary.
// 0 magic/version, 1 producer token, 2 invalid flags, 3 coverage, 4/5/6 hit/miss/failure,
// 7..11 unresolved reasons, 12 hit-conditioned unavailable normals. Recovering frames
// add 13..16 outcomes, 17..20 stops, 21 midpoints, 22 encounters, 23 attempts.
import { REASON_SLOTS, REASON_CLASSES } from './outcome-masks.js';
import { RECOVERY_WORD } from './webgpu/passes.js';

export const DRAFT_SUMMARY_VERSION = 'draft-summary-v1';
export const DRAFT_SUMMARY_MAGIC = 0x41545301;
export const draftSummaryBytes = recovery => recovery ? 96 : 64;
const invalid = message => { throw new RangeError(`invalid draft summary: ${message}`); };
const sum = words => words.reduce((a, b) => a + b, 0);
const zeros = labels => Object.fromEntries(labels.map(label => [label, 0]));
export function draftProducerMarker(producerToken) {
  if (!Number.isInteger(producerToken) || producerToken < 0 || producerToken > 0x7fffffff) invalid('producer token');
  return producerToken ? (producerToken * 2) >>> 0 : 0x41540000;
}

// Independent CPU reference for the 8x8 GPU reduction, also used by device doubles.
// Invalid packets produce flagged summaries; neither CPU nor GPU validation accepts them.
export function reduceDraftPacket(packet, { width, height, recovery, producerToken }) {
  const words = new Uint32Array(draftSummaryBytes(recovery) / 4), stride = recovery ? 12 : 8;
  words[0] = DRAFT_SUMMARY_MAGIC; words[1] = producerToken;
  const marker = draftProducerMarker(producerToken);
  if (!(packet instanceof Uint8Array)) invalid('packet type');
  if (packet.byteLength !== width * height * stride) words[2] |= 16;
  const data = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  for (let offset = 0; offset + stride <= packet.byteLength; offset += stride) {
    const statusWord = data.getUint32(offset, true), normal = data.getUint32(offset + 4, true);
    const status = statusWord & 15, reason = (statusWord >>> 4) & 15, subreason = (statusWord >>> 8) & 15;
    words[3]++;
    if (((normal & 0xfffffffe) >>> 0) !== marker) words[2] |= 1;
    if (status === 0) { words[4]++; if (!(normal & 1)) words[12]++; }
    else if (status === 1) words[5]++;
    else if (status === 3) words[6]++;
    else if (status === 2) {
      if (reason >= 1 && reason <= 3) words[6 + reason]++;
      else if (reason === 4 && (subreason === 1 || subreason === 2)) words[9 + subreason]++;
      else words[2] |= 4;
    } else words[2] |= 2;
    if (recovery) {
      const value = data.getUint32(offset + 8, true);
      if (!value) continue;
      const outcome = (value >>> 8) & 15, stop = (value >>> 12) & 15;
      const expected = [[-1, -1], [0, 0], [3, 0], [2, 2], [2, 1]][outcome];
      if (value > 0xffff || !expected || status !== expected[0] || (expected[1] && reason !== expected[1]) ||
          (stop !== 0) !== (outcome === 4) || stop > 4 || (value & 15) > 8) { words[2] |= 8; continue; }
      words[12 + outcome]++; if (stop) words[16 + stop]++;
      words[21] += value & 15; words[22] += (value >>> 4) & 15; words[23]++;
    }
  }
  return new Uint8Array(words.buffer);
}

export function validateDraftSummary(bytes, { pixels, recovery, producerToken }) {
  draftProducerMarker(producerToken);
  if (!Number.isSafeInteger(pixels) || pixels < 1 || pixels > 0x0fffffff) invalid('pixel count');
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== draftSummaryBytes(recovery)) invalid('byte length');
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const w = Array.from({ length: bytes.length / 4 }, (_, i) => data.getUint32(4 * i, true));
  if (w[0] !== DRAFT_SUMMARY_MAGIC || w[1] !== producerToken || w[2] !== 0) invalid('version, producer identity or invalid-data flags');
  if (w[3] !== pixels || sum(w.slice(4, 12)) !== pixels || w[12] > w[4]) invalid('coverage or terminal counts');
  if (!recovery && w.slice(13).some(Boolean)) invalid('reserved words');
  const reasons = Object.fromEntries(REASON_CLASSES.map(name => [name, zeros([...REASON_SLOTS, 'multiple'])]));
  REASON_SLOTS.slice(0, 5).forEach((name, i) => { reasons.primaryUnresolved[name] = w[7 + i]; });
  const metrics = { pixels, hits: w[4], nonMiss: pixels - w[5], primaryUnresolved: sum(w.slice(7, 12)), numericalFailures: w[6], unavailableNormals: w[12],
    lightingUnresolved: 0, shadowUnresolved: 0, aoUnresolved: 0, lightingNumericalFailures: 0 };
  let recoveryMetrics = null;
  if (recovery) {
    if (sum(w.slice(13, 17)) !== w[23] || w[23] > pixels || sum(w.slice(17, 21)) !== w[16] ||
        w[13] > w[4] || w[14] > w[6] || w[15] > w[8] || w[16] > w[7] || w[21] > 8 * w[23] || w[22] > 15 * w[23]) invalid('recovery aggregates');
    recoveryMetrics = { attempts: w[23], outcomes: Object.fromEntries(RECOVERY_WORD.outcomes.slice(1).map((name, i) => [name, w[13 + i]])),
      stops: Object.fromEntries(RECOVERY_WORD.stops.slice(1).map((name, i) => [name, w[17 + i]])), midpoints: w[21], encounters: w[22] };
  }
  return { evidence: DRAFT_SUMMARY_VERSION, producerToken, metrics, reasons, recovery: recoveryMetrics,
    counts: { rayTermination: { hit: w[4], miss: w[5], numericalFailure: w[6], unresolved: { pointBudget: w[7], estimateUnavailable: w[8], rayStepBudget: w[9], stagnation: { rayParameter: w[10], fieldCoordinate: w[11] } } },
      unavailableNormals: w[12], lightingFailures: { shadow: 0, ao: 0, both: 0 } } };
}
