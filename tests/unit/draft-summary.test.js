import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAFT_SUMMARY_MAGIC, draftSummaryBytes, reduceDraftPacket, validateDraftSummary } from '../../src/space/render/draft-summary.js';
import { createOutcomeMasks } from '../../src/space/render/outcome-masks.js';
import { packStatus } from '../../src/space/render/status.js';
import { packRecoveryWord } from '../../src/space/render/webgpu/passes.js';

import { packetFixture } from '../support/draft-summary-fixtures.mjs';
const recovered = (outcome, stop = 'none') => packRecoveryWord({ attempted: true, outcome, stop, midpoints: 5, encounters: 3 });

test('r4-F1 nonrecovering summaries occupy exactly 64 bytes', () => {
  assert.equal(draftSummaryBytes(false), 64);
  assert.equal(draftSummaryBytes(true), 96);
});

// Build the ABI bytes independently: no packet reducer can set flags that mask a
// missing validator rule. The control has one pixel in each terminal category.
function summaryBytes(recovery) {
  const bytes = new Uint8Array(recovery ? 96 : 64), data = new DataView(bytes.buffer);
  const values = [DRAFT_SUMMARY_MAGIC, 101, 0, 8, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ...(recovery ? [1, 1, 1, 1, 1, 0, 0, 0, 4, 4, 4] : [0, 0, 0])];
  values.forEach((value, i) => data.setUint32(i * 4, value, true));
  return bytes;
}
for (const [rule, recovery, edits, error] of [
  ['V3 magic', false, [[0, 0]], /version/],
  ['V3 producer', false, [[1, 102]], /producer/],
  ['V3 invalid flags', false, [[2, 16]], /invalid-data flags/],
  ['V4 coverage', false, [[3, 7]], /coverage/],
  ['V4 terminal sum', false, [[5, 2]], /terminal counts/],
  ['V5 normals bounded by hits', false, [[12, 2]], /terminal counts/],
  ...[13, 14, 15].map(slot => [`reserved word ${slot}`, false, [[slot, 1]], /reserved words/]),
  ['V6 attempts sum', true, [[23, 5]], /recovery aggregates/],
  ['V7 stops sum', true, [[17, 0]], /recovery aggregates/],
  ['V8 recovered hits bounded by hits', true, [[4, 0], [5, 2], [12, 0]], /recovery aggregates/],
  ['V8 recovered failures bounded by failures', true, [[6, 0], [5, 2]], /recovery aggregates/],
  ['V8 recovered unavailable bounded by unavailable', true, [[8, 0], [5, 2]], /recovery aggregates/],
  ['V8 recovered stops bounded by point budget', true, [[7, 0], [5, 2]], /recovery aggregates/],
  ['V9 midpoint bound', true, [[21, 33]], /recovery aggregates/],
  ['V9 encounter bound', true, [[22, 61]], /recovery aggregates/],
]) test(`r4-F1 summary bytes reject ${rule}`, () => {
  const bytes = summaryBytes(recovery), options = { pixels: 8, recovery, producerToken: 101 };
  assert.doesNotThrow(() => validateDraftSummary(bytes, options), 'valid control');
  const data = new DataView(bytes.buffer);
  for (const [slot, value] of edits) data.setUint32(slot * 4, value, true);
  assert.throws(() => validateDraftSummary(bytes, options), error);
});

function fullDecode(packet, { width, height, recovery, producerToken = 0 }) {
  const masks = createOutcomeMasks({ width, height }, { recovery, producerToken }), id = { accumulationKey: 'same-packet', sample: 0 };
  masks.recordDraft(id, { x: 0, y: 0, width, height }, packet); masks.end(id);
  return masks.snapshot();
}

test('B15-R16-F2 full packet decode rejects the same unknown reason as the summary', () => {
  for (const recovery of [false, true]) {
    const options = { width: 1, height: 1, recovery, producerToken: 101 };
    const packet = packetFixture(options), view = new DataView(packet.buffer);
    view.setUint32(0, 0x72, true);
    if (recovery) view.setUint32(8, 0, true); // isolate reason validation from recovery consistency
    assert.throws(() => validateDraftSummary(reduceDraftPacket(packet, options), { ...options, pixels: 1 }));
    assert.throws(() => fullDecode(packet, options), /reason/, 'full decode must reject invalid primary reasons too');
  }
});

test('B15-R16-F2 all draft unresolved reason nibbles agree between full decode and reduction', () => {
  for (const recovery of [false, true]) for (let reason = 0; reason < 16; reason++) for (let subreason = 0; subreason < 16; subreason++) {
    const options = { width: 1, height: 1, recovery, producerToken: 101 };
    const packet = packetFixture(options), view = new DataView(packet.buffer);
    view.setUint32(0, 2 | (reason << 4) | (subreason << 8), true);
    if (recovery) view.setUint32(8, 0, true);
    const valid = reason >= 1 && reason <= 3 || reason === 4 && (subreason === 1 || subreason === 2);
    const decode = () => fullDecode(packet, options);
    const reduce = () => validateDraftSummary(reduceDraftPacket(packet, options), { ...options, pixels: 1 });
    if (valid) assert.deepEqual(decode().reasons.samples[0].primaryUnresolved, reduce().reasons.primaryUnresolved);
    else { assert.throws(decode, /reason/); assert.throws(reduce, /invalid/); }
  }
});

test('B15-REC-G summary preserves every aggregate of the same fully decoded packet in 64 or 96 bytes', () => {
  for (const producerToken of [0, 101, 0x7fffffff]) for (const recovery of [false, true]) for (const [width, height] of [[1, 1], [13, 9], [64, 17]]) {
    const options = { width, height, recovery, producerToken }, packet = packetFixture(options);
    const bytes = reduceDraftPacket(packet, options);
    assert.ok(bytes instanceof Uint8Array, 'the reducer returns a versioned summary');
    assert.equal(bytes.length, draftSummaryBytes(recovery));
    const summary = validateDraftSummary(bytes, { ...options, pixels: width * height }), decoded = fullDecode(packet, options);
    const { sample, ...metrics } = decoded.samples[0];
    assert.deepEqual(summary.metrics, metrics);
    assert.deepEqual(summary.reasons, decoded.reasons.samples[0]);
    const reference = decoded.recovery?.samples[0];
    assert.deepEqual(summary.recovery, reference ? Object.fromEntries(Object.entries(reference).filter(([key]) => key !== 'sample')) : null);
  }
});

test('B15-REC-G summary rejects the same malformed coverage status and recovery as the full packet decode', () => {
  const options = { width: 13, height: 9, recovery: true, producerToken: 0 };
  for (const [slot, value] of [[1, 0], [0, 15], [2, 0x1ffff], [2, recovered('point-budget', 'midpoint-limit')], [2, 0x11f]]) {
    const packet = packetFixture(options); new DataView(packet.buffer).setUint32(slot * 4, value, true);
    assert.throws(() => fullDecode(packet, options));
    assert.throws(() => validateDraftSummary(reduceDraftPacket(packet, options), { ...options, pixels: 117 }));
  }
});

test('B15-REC-G summary provenance rejects stale producer ids and reused or incomplete evidence', () => {
  const options = { width: 13, height: 9, recovery: true, producerToken: 101 }, packet = packetFixture(options);
  const first = reduceDraftPacket(packet, options);
  assert.ok(first instanceof Uint8Array);
  assert.doesNotThrow(() => validateDraftSummary(first, { ...options, pixels: 117 }));
  assert.throws(() => validateDraftSummary(first, { ...options, producerToken: 102, pixels: 117 }));
  assert.throws(() => validateDraftSummary(reduceDraftPacket(packet, { ...options, producerToken: 102 }), { ...options, producerToken: 102, pixels: 117 }));
  assert.throws(() => validateDraftSummary(first, { ...options, pixels: 118 }));
  assert.throws(() => validateDraftSummary(first.slice(0, 64), { ...options, pixels: 117 }));
  const next = reduceDraftPacket(packetFixture({ ...options, producerToken: 102 }), { ...options, producerToken: 102 });
  assert.deepEqual(validateDraftSummary(first, { ...options, pixels: 117 }).metrics, validateDraftSummary(next, { ...options, producerToken: 102, pixels: 117 }).metrics, 'fresh reduction resets counters');
});
