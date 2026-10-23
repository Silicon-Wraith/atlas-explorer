// B15-R8-F5: the packed-draft-diagnostics equivalence check, shared by the headed rendering
// assertion (tests/space.mjs, real GPU bytes) and its unit RED/GREEN guard (synthetic bytes).
// fixture-recovery (tests/space.mjs) writes patternRecoveryWord into the recovery target; the
// words are valid for fixture-pattern's statuses, varied and nonzero, so omitted or misplaced
// recovery packing cannot compare equal to an all-zero independent readback.
import assert from 'node:assert/strict';
import { createOutcomeMasks, recoveryMetrics } from '../../src/space/render/outcome-masks.js';
import { decodeNormals } from '../../src/space/render/webgpu/passes.js';

const u32s = b => new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4);
const PATTERN_KINDS = 13;

// Mirror of fixture-recovery's WGSL recovery_word (midpoints | encounters << 4 | outcome << 8 | stop << 12).
// Kinds are fixture-pattern's 4-pixel columns: 0 hit, 2 point-budget, 3 estimate-unavailable, 8 numerical failure.
export function patternRecoveryWord(x, y) {
  const kind = Math.floor(x / 4) % PATTERN_KINDS;
  if (kind === 0) return y % 2 === 0 ? (3 | 2 << 4 | 1 << 8) : 0; // approximate hit; odd rows unattempted
  if (kind === 2) return (8 | (1 + x % 4) << 4 | 4 << 8 | (1 + y % 4) << 12) >>> 0; // point-budget, every stop detail
  if (kind === 3) return 2 | 1 << 4 | 3 << 8; // estimate-unavailable
  if (kind === 8) return 5 | 3 << 4 | 2 << 8; // numerical failure
  return 0;
}

// size {width,height}; recovery: a recovering family (stride 3). All byte inputs are Uint8Array.
export function checkPackedDiagnostics({ size, recovery, packet, status, normal, lightingStatus, recoveryWords, display, packedDisplay, expectedRecovery = patternRecoveryWord }) {
  const { width: W, height: H } = size, pixels = W * H, stride = recovery ? 3 : 2;
  assert.deepEqual(packedDisplay, display, 'packing cannot change display bytes');
  assert.equal(packet.byteLength, pixels * stride * 4, 'exactly one packet word set per pixel is transferred');
  const words = u32s(packet), statuses = u32s(status), normals = decodeNormals(normal, pixels);
  assert.equal(statuses.length, pixels);
  const independentRecovery = recovery ? u32s(recoveryWords) : null;
  if (recovery) {
    assert.equal(independentRecovery.length, pixels);
    for (let i = 0; i < pixels; i++) assert.equal(independentRecovery[i], expectedRecovery(i % W, Math.floor(i / W)), `pixel ${i}: fixture recovery word present`);
    const nonzero = independentRecovery.filter(Boolean);
    assert.ok(nonzero.length > 0 && new Set(nonzero).size >= 4, 'varied nonzero recovery words are under test');
  }
  for (let i = 0; i < pixels; i++) {
    assert.equal(words[i * stride], statuses[i], `pixel ${i} status/reason/steps`);
    assert.equal(words[i * stride + 1], (0x41540000 | Number(normals[i].available)) >>> 0, `pixel ${i} coverage/normal`);
    if (recovery) assert.equal(words[i * stride + 2], independentRecovery[i], `pixel ${i} recovery`);
  }
  assert.ok(u32s(lightingStatus).every(word => word === 0), 'direct secondary flags are provably zero');
  const packed = createOutcomeMasks(size, { recovery }), separate = createOutcomeMasks(size, { recovery });
  const id = { accumulationKey: 'gpu-equivalence', sample: 0 }, region = { x: 0, y: 0, ...size };
  packed.recordDraft(id, region, packet);
  const raw = { status, normal, lightingStatus, ...(recovery ? { recovery: recoveryWords } : {}) };
  for (const [field, data] of Object.entries(raw)) separate.record(id, field, region, data);
  assert.deepEqual(packed.end(id), separate.end(id));
  const snapshot = packed.snapshot();
  assert.deepEqual(snapshot, separate.snapshot());
  assert.deepEqual(packed.unionBits(), separate.unionBits()); assert.deepEqual(packed.unionReasons(), separate.unionReasons());
  let recoveryCounts = null;
  if (recovery) {
    const expected = recoveryMetrics(independentRecovery);
    assert.deepEqual(snapshot.recovery.samples, [{ sample: 0, ...expected }], 'exact packed recovery counts');
    assert.equal(snapshot.recovery.union.attempted, expected.attempts);
    recoveryCounts = expected;
  } else assert.equal(snapshot.recovery, null);
  return { stride, pixels, packetBytes: packet.byteLength, exactMasks: true, identicalDisplay: true, recovery: recoveryCounts };
}
