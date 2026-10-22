import test from 'node:test';
import assert from 'node:assert/strict';
import { draftSummaryBytes, reduceDraftPacket, validateDraftSummary } from '../../src/space/render/draft-summary.js';
import { createOutcomeMasks } from '../../src/space/render/outcome-masks.js';
import { packStatus } from '../../src/space/render/status.js';
import { packRecoveryWord } from '../../src/space/render/webgpu/passes.js';

import { packetFixture } from '../support/draft-summary-fixtures.mjs';
const recovered = (outcome, stop = 'none') => packRecoveryWord({ attempted: true, outcome, stop, midpoints: 5, encounters: 3 });

function fullDecode(packet, { width, height, recovery, producerToken = 0 }) {
  const masks = createOutcomeMasks({ width, height }, { recovery, producerToken }), id = { accumulationKey: 'same-packet', sample: 0 };
  masks.recordDraft(id, { x: 0, y: 0, width, height }, packet); masks.end(id);
  return masks.snapshot();
}

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
