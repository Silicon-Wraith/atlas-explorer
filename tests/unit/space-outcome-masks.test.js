// B11b: identity-, pixel- and sample-indexed outcome masks (plan rev 5.0 B11b "Files/interfaces/tests").
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutcomeMasks, createWorkerOutcomeMasks, OUTCOME_BITS, maskMetrics, reasonMetrics } from '../../src/space/render/outcome-masks.js';
import { packStatus, packLightingStatus } from '../../src/space/render/status.js';
import { createMaskWork } from '../../src/space/render/mask-work.js';

test('B15-R16-F8 settled sample mask work stays within a two millisecond task budget', async () => {
  // Deterministic cost model: one millisecond per 1024 decoded/finalized pixels.
  // This catches both an unsliced scan hidden in one iterator step and microtask
  // chains that reset their deadline without actually yielding a browser task.
  let time = 0, taskStart = 0, largest = 0, yields = 0, chunks = 0;
  const queue = createMaskWork({ clock: () => time, yieldTask: async () => {
    largest = Math.max(largest, time - taskStart); taskStart = time; yields++;
  } });
  const work = { run(steps, valid) { return queue.run((function* () {
    while (true) { const step = steps.next(); if (step.done) return step.value; time += step.value / 1024; chunks++; yield; }
  })(), valid); } };
  const size = { width: 1280, height: 720 }, pixels = size.width * size.height, region = { x: 0, y: 0, ...size };
  const masks = createOutcomeMasks(size, { work });
  for (let n = 0; n < 2; n++) {
    const id = { accumulationKey: 'settled', sample: n };
    await masks.recordAsync(id, 'status', region, new Uint8Array(pixels * 4));
    await masks.recordAsync(id, 'normal', region, new Uint8Array(pixels * 8));
    await masks.recordAsync(id, 'lightingStatus', region, new Uint8Array(pixels * 4));
    await masks.endAsync(id);
    largest = Math.max(largest, time - taskStart);
    assert.ok(largest <= 2, `sample ${n}: largest main-thread mask task ${largest} ms exceeds 2 ms`);
    assert.equal(masks.snapshot().union.hits, pixels);
  }
  assert.ok(yields > 1); assert.ok(chunks >= pixels * 8 / 512, 'no monolithic pixel scan can hide in a step');
});

const B = OUTCOME_BITS;
const HIT = packStatus({ status: 0, reason: 0, subreason: 0, steps: 3 }), MISS = packStatus({ status: 1, reason: 0, subreason: 0, steps: 3 });
const UNRESOLVED = packStatus({ status: 2, reason: 3, subreason: 0, steps: 512 }), FAILED = packStatus({ status: 3, reason: 0, subreason: 0, steps: 1 });
const AO_UNRESOLVED = packLightingStatus({ shadow: null, ao: { status: 2, reason: 1, subreason: 0 } });
const SHADOW_UNRESOLVED = packLightingStatus({ shadow: { status: 2, reason: 3, subreason: 0 }, ao: null });
const AO_FAILED = packLightingStatus({ shadow: null, ao: { status: 3, reason: 0, subreason: 0 } });
const u32 = values => new Uint8Array(Uint32Array.from(values).buffer);
const normals = flags => { const h = new Uint16Array(flags.length * 4); flags.forEach((f, i) => { h[4 * i + 2] = 0x3c00; h[4 * i + 3] = f ? 0x3c00 : 0; }); return new Uint8Array(h.buffer); };
const full = n => ({ x: 0, y: 0, width: n, height: 1 });
const identity = (sample, accumulationKey = 'acc-A') => ({ accumulationKey, sample });
function sample(masks, id, { status, normal, lighting }) {
  const n = status.length;
  masks.record(id, 'status', full(n), u32(status));
  masks.record(id, 'normal', full(n), normals(normal));
  masks.record(id, 'lightingStatus', full(n), u32(lighting ?? Array(n).fill(0)));
  return masks.end(id);
}

test('outcome masks count unavailable normals over hits only and lighting failures per sample', () => {
  const masks = createOutcomeMasks({ width: 6, height: 1 });
  const s = sample(masks, identity(0), { status: [HIT, MISS, HIT, UNRESOLVED, FAILED, HIT], normal: [false, false, true, false, false, true], lighting: [0, 0, AO_UNRESOLVED, 0, 0, AO_FAILED] });
  assert.deepEqual(s, { sample: 0, pixels: 6, hits: 3, nonMiss: 5, primaryUnresolved: 1, numericalFailures: 2, unavailableNormals: 1, lightingUnresolved: 1, shadowUnresolved: 0, aoUnresolved: 1, lightingNumericalFailures: 1 });
  assert.deepEqual(masks.counts(), { rayTermination: { hit: 3, miss: 1, numericalFailure: 1,
    unresolved: { pointBudget: 0, estimateUnavailable: 0, rayStepBudget: 1, stagnation: { rayParameter: 0, fieldCoordinate: 0 } } },
    unavailableNormals: 1, lightingFailures: { shadow: 0, ao: 2, both: 0 } });
});

test('B15-R16-F8 mask work yields actual task turns and invalidation stops its iterator', async () => {
  const events = [];
  setTimeout(() => events.push('input'), 0);
  await createMaskWork().run((function* () {
    assert.deepEqual(events, ['input']);
    setTimeout(() => events.push('next input'), 0);
    yield;
  })());
  assert.deepEqual(events, ['input', 'next input']);
  let valid = true, steps = 0, closed = false;
  const queue = createMaskWork({ clock: () => steps, budgetMs: 1, yieldTask: async () => { if (steps) valid = false; } });
  await assert.rejects(queue.run((function* () { try { while (true) { steps++; yield; } } finally { closed = true; } })(), () => valid), /invalidated/);
  assert.equal(steps, 1); assert.equal(closed, true);
  assert.equal(await queue.run((function* () { return 'next job'; })()), 'next job', 'a rejected job cannot poison the serial queue');
});

test('B15-R16-F8 yielded counts and incremental snapshots agree across tiled samples and reordered fields', async () => {
  const width = 65, height = 17, pixels = width * height, masks = createOutcomeMasks({ width, height }, { strict: true });
  const statuses = [HIT, MISS, UNRESOLVED, FAILED], union = new Uint16Array(pixels), unionReasons = new Uint32Array(pixels);
  let previous;
  for (let sample = 0; sample < 3; sample++) {
    const id = identity(sample), expected = { hit: 0, miss: 0, unresolved: 0, numericalFailure: 0, unavailableNormals: 0, both: 0 };
    for (const field of ['normal', 'lightingStatus', 'status']) for (let y = height - 1; y >= 0; y--) {
      const values = Array.from({ length: width }, (_, x) => {
        const i = y * width + x, status = (i + sample) % 4, available = (i + sample) % 3 === 0;
        if (field === 'normal') return available;
        if (field === 'lightingStatus') return status === 0 ? AO_UNRESOLVED | SHADOW_UNRESOLVED : 0;
        expected[['hit', 'miss', 'unresolved', 'numericalFailure'][status]]++;
        if (status === 0 && !available) expected.unavailableNormals++;
        if (status === 0) expected.both++;
        union[i] |= [B.hit, B.miss, B.primaryUnresolved, B.primaryNumericalFailure][status] |
          (status === 0 ? B.shadowUnresolved | B.aoUnresolved | (available ? 0 : B.normalUnavailable) : 0);
        unionReasons[i] |= status === 2 ? 4 : status === 0 ? (4 << 8) | (1 << 16) : 0;
        return statuses[status];
      });
      await masks.ingest(id, field, { x: 0, y, width, height: 1 }, field === 'normal' ? normals(values) : u32(values));
    }
    assert.equal(masks.closed(id), true);
    const snapshot = masks.snapshot(), counts = masks.counts();
    assert.deepEqual(snapshot.union, maskMetrics(union, sample + 1));
    assert.deepEqual(snapshot.reasons.union, reasonMetrics(unionReasons));
    assert.deepEqual([counts.rayTermination.hit, counts.rayTermination.miss, counts.rayTermination.unresolved.rayStepBudget,
      counts.rayTermination.numericalFailure, counts.unavailableNormals, counts.lightingFailures.both], Object.values(expected));
    if (previous) assert.equal(previous.samples.length, sample, 'a published snapshot stays detached from later samples');
    snapshot.union.hits = -1;
    assert.notEqual(masks.snapshot().union.hits, -1, 'snapshots cannot mutate the accumulated metrics');
    previous = snapshot;
  }
});

test('outcome-mask unions are pixelwise over the same samples, mixing hits and misses and isolated failures', () => {
  const masks = createOutcomeMasks({ width: 4, height: 1 });
  // Pixel 0: hit in sample 0, miss in sample 1 (an antialiased edge). Pixel 1: misses only. Pixel 2: an isolated AO
  // failure in sample 1 only. Pixel 3: an unavailable normal in sample 0 only, and a shadow failure in sample 1.
  sample(masks, identity(0), { status: [HIT, MISS, HIT, HIT], normal: [true, false, true, false] });
  sample(masks, identity(1), { status: [MISS, MISS, HIT, HIT], normal: [false, false, true, true], lighting: [0, 0, AO_UNRESOLVED, SHADOW_UNRESOLVED] });
  const snapshot = masks.snapshot();
  assert.equal(snapshot.accumulationKey, 'acc-A');
  assert.deepEqual(snapshot.samples.map(s => [s.hits, s.unavailableNormals, s.lightingUnresolved]), [[3, 1, 0], [2, 0, 2]]);
  assert.deepEqual(snapshot.union, { samples: 2, pixels: 4, hits: 3, nonMiss: 3, primaryUnresolved: 0, numericalFailures: 0, unavailableNormals: 1, lightingUnresolved: 2, shadowUnresolved: 1, aoUnresolved: 1, lightingNumericalFailures: 0 });
  const bits = masks.unionBits();
  assert.equal(bits[0], B.hit | B.miss); assert.equal(bits[1], B.miss);
  assert.equal(bits[2], B.hit | B.aoUnresolved); assert.equal(bits[3], B.hit | B.normalUnavailable | B.shadowUnresolved);
  assert.deepEqual(maskMetrics(bits, 2), snapshot.union, 'the metrics are a pure function of the union bits');
});

test('outcome masks accept tiles in any order within a sample and refuse an incomplete or misordered sample', () => {
  const masks = createOutcomeMasks({ width: 2, height: 2 });
  const id = identity(0), tile = (y, values) => ({ region: { x: 0, y, width: 2, height: 1 }, values });
  for (const field of ['lightingStatus', 'normal', 'status']) for (const { region, values } of [tile(1, [HIT, MISS]), tile(0, [HIT, HIT])]) {
    masks.record(id, field, region, field === 'status' ? u32(values) : field === 'normal' ? normals([true, false]) : u32([0, 0]));
  }
  assert.equal(masks.end(id).hits, 3);
  assert.throws(() => masks.end(identity(1)), /incomplete/);
  const partial = createOutcomeMasks({ width: 2, height: 2 });
  partial.record(identity(0), 'status', { x: 0, y: 0, width: 2, height: 1 }, u32([HIT, HIT]));
  assert.throws(() => partial.end(identity(0)), /incomplete/);
  assert.throws(() => partial.record(identity(0), 'status', { x: 1, y: 1, width: 2, height: 1 }, u32([HIT, HIT])), /outside/);
  assert.throws(() => partial.record(identity(0), 'status', full(2), u32([HIT])), /bytes/);
});

test('a new accumulation identity or sample zero resets the union, and a stale identity is refused', () => {
  const masks = createOutcomeMasks({ width: 2, height: 1 });
  sample(masks, identity(0, 'direct'), { status: [HIT, HIT], normal: [false, false] });
  assert.equal(masks.snapshot().union.unavailableNormals, 2);
  // The full-light accumulation starts again at sample 0: nothing of the direct identity survives.
  sample(masks, identity(0, 'full'), { status: [HIT, MISS], normal: [true, false] });
  assert.deepEqual([masks.snapshot().accumulationKey, masks.snapshot().union.unavailableNormals, masks.snapshot().samples.length], ['full', 0, 1]);
  // A readback for another identity, a skipped sample or a repeated sample never enters the union.
  assert.throws(() => masks.record(identity(1, 'direct'), 'status', full(2), u32([HIT, HIT])), /stale/);
  assert.throws(() => masks.record(identity(2, 'full'), 'status', full(2), u32([HIT, HIT])), /order/);
  assert.throws(() => masks.record(identity(0, 'full'), 'status', full(2), u32([HIT, HIT])), /order/);
  sample(masks, identity(1, 'full'), { status: [HIT, HIT], normal: [true, true] });
  assert.equal(masks.snapshot().union.hits, 2);
  // Reset: an explicit reset forgets everything.
  masks.reset();
  assert.equal(masks.snapshot(), null);
});

test('outcome masks keep reason and subreason bits per pixel class, per sample and in the union', () => {
  const masks = createOutcomeMasks({ width: 4, height: 1 });
  const POINT = packStatus({ status: 2, reason: 1, subreason: 0, steps: 2 }), STAGNANT = packStatus({ status: 2, reason: 4, subreason: 2, steps: 9 });
  const AO_ESTIMATE = packLightingStatus({ shadow: null, ao: { status: 2, reason: 2, subreason: 0 } });
  const BOTH = packLightingStatus({ shadow: { status: 2, reason: 4, subreason: 1 }, ao: { status: 2, reason: 1, subreason: 0 } });
  // Sample 0: pixel 0 point-budget primary; pixel 1 AO point-budget; pixel 2 shadow step-cap; pixel 3 a numerical AO
  // failure (no reason). Sample 1: pixel 0 stagnation (field coordinate); pixel 1 AO estimate-unavailable; pixel 2
  // shadow stagnation (ray parameter) and AO point-budget.
  sample(masks, identity(0), { status: [POINT, HIT, HIT, HIT], normal: [false, true, true, true], lighting: [0, AO_UNRESOLVED, SHADOW_UNRESOLVED, AO_FAILED] });
  sample(masks, identity(1), { status: [STAGNANT, HIT, HIT, HIT], normal: [false, true, true, true], lighting: [0, AO_ESTIMATE, BOTH, 0] });
  const zero = { 'point-budget': 0, 'estimate-unavailable': 0, 'ray-step-budget': 0, 'stagnation/ray-parameter': 0, 'stagnation/field-coordinate': 0, unspecified: 0, multiple: 0 };
  const { reasons } = masks.snapshot();
  assert.deepEqual(reasons.samples[0], { primaryUnresolved: { ...zero, 'point-budget': 1 }, shadowUnresolved: { ...zero, 'ray-step-budget': 1 }, aoUnresolved: { ...zero, 'point-budget': 1 } });
  assert.deepEqual(reasons.samples[1], { primaryUnresolved: { ...zero, 'stagnation/field-coordinate': 1 }, shadowUnresolved: { ...zero, 'stagnation/ray-parameter': 1 },
    aoUnresolved: { ...zero, 'point-budget': 1, 'estimate-unavailable': 1 } });
  // The union counts pixels per reason (a pixel failing for two reasons counts under both and under `multiple`).
  assert.deepEqual(reasons.union, { primaryUnresolved: { ...zero, 'point-budget': 1, 'stagnation/field-coordinate': 1, multiple: 1 },
    shadowUnresolved: { ...zero, 'ray-step-budget': 1, 'stagnation/ray-parameter': 1, multiple: 1 }, aoUnresolved: { ...zero, 'point-budget': 2, 'estimate-unavailable': 1, multiple: 1 } });
  assert.deepEqual(reasonMetrics(masks.unionReasons()), reasons.union, 'the union reasons are a pure function of the per-pixel reason bits');
});

// B11c (spec §11.4 rev 5.1; plan B11b FU2): quaternion-primary recovery diagnostics, per sample and over the union,
// kept apart from the terminal ray outcomes; a recovery word must agree with its pixel's primary status.
test('recovery masks count attempts, outcomes, stops, midpoints and encounters per sample and over the union', async () => {
  const { packRecoveryWord } = await import('../../src/space/render/webgpu/passes.js');
  const rec = (outcome, midpoints, encounters, stop = 'none') => packRecoveryWord({ attempted: true, outcome, stop, midpoints, encounters });
  const POINT = packStatus({ status: 2, reason: 1, subreason: 0, steps: 12 }), ESTIMATE = packStatus({ status: 2, reason: 2, subreason: 0, steps: 6 });
  const masks = createOutcomeMasks({ width: 4, height: 1 }, { recovery: true });
  const recSample = (id, status, recovery) => {
    masks.record(id, 'status', full(4), u32(status)); masks.record(id, 'normal', full(4), normals([true, true, true, true]));
    masks.record(id, 'lightingStatus', full(4), u32([0, 0, 0, 0])); masks.record(id, 'recovery', full(4), u32(recovery));
    return masks.end(id);
  };
  // Sample 0: pixel 0 recovered (2 midpoints, 2 encounters); pixel 1 stopped at the midpoint limit; pixel 2 a plain hit; pixel 3 a miss.
  recSample(identity(0), [HIT, POINT, HIT, MISS], [rec('approximate hit', 2, 2), rec('point-budget', 8, 6, 'midpoint-limit'), 0, 0]);
  // Sample 1: pixel 0 an estimate-unavailable midpoint; pixel 1 recovered this time.
  recSample(identity(1), [ESTIMATE, HIT, HIT, MISS], [rec('estimate-unavailable', 1, 1), rec('approximate hit', 3, 1), 0, 0]);
  const { recovery } = masks.snapshot();
  assert.ok(recovery, 'the snapshot keeps the recovery diagnostics');
  const outcomes = (o = {}) => ({ 'approximate hit': 0, 'numerical failure': 0, 'estimate-unavailable': 0, 'point-budget': 0, ...o });
  const stops = (o = {}) => ({ 'midpoint-limit': 0, 'parameter-collapse': 0, 'coordinate-collapse': 0, 'evaluation-cap': 0, ...o });
  assert.deepEqual(recovery.samples[0], { sample: 0, attempts: 2, outcomes: outcomes({ 'approximate hit': 1, 'point-budget': 1 }), stops: stops({ 'midpoint-limit': 1 }), midpoints: 10, encounters: 8 });
  assert.deepEqual(recovery.samples[1], { sample: 1, attempts: 2, outcomes: outcomes({ 'approximate hit': 1, 'estimate-unavailable': 1 }), stops: stops(), midpoints: 4, encounters: 2 });
  assert.deepEqual(recovery.union, { samples: 2, pixels: 4, attempted: 2, outcomes: outcomes({ 'approximate hit': 2, 'point-budget': 1, 'estimate-unavailable': 1 }), stops: stops({ 'midpoint-limit': 1 }) });
  // A recovery word must agree with the terminal status of the same pixel and sample.
  const bad = createOutcomeMasks({ width: 1, height: 1 }, { recovery: true });
  bad.record(identity(0), 'status', full(1), u32([MISS])); bad.record(identity(0), 'normal', full(1), normals([false]));
  bad.record(identity(0), 'lightingStatus', full(1), u32([0])); bad.record(identity(0), 'recovery', full(1), u32([rec('approximate hit', 1, 1)]));
  assert.throws(() => bad.end(identity(0)), /recovery/);
  // Without recovery (a non-recovering family) the field is refused and the snapshot has none.
  const plain = createOutcomeMasks({ width: 1, height: 1 });
  assert.throws(() => plain.record(identity(0), 'recovery', full(1), u32([0])), /recovery/);
  sample(plain, identity(0), { status: [HIT], normal: [true] });
  assert.equal(plain.snapshot().recovery, null);
  // With recovery, a sample is incomplete until its recovery words arrive.
  const waiting = createOutcomeMasks({ width: 1, height: 1 }, { recovery: true });
  assert.throws(() => sample(waiting, identity(0), { status: [HIT], normal: [true] }), /incomplete/);
});


test('packed draft masks preserve pixelwise statuses reasons normal availability and recovery exactly', () => {
  const states = [HIT, MISS, UNRESOLVED, FAILED, packStatus({ status: 2, reason: 4, subreason: 2, steps: 13 })];
  for (const recovery of [false, true]) {
    const packed = createOutcomeMasks({ width: 5, height: 1 }, { recovery });
    const separate = createOutcomeMasks({ width: 5, height: 1 }, { recovery });
    assert.equal(typeof packed.recordDraft, 'function');
    const recovered = 0x122; // approximate hit, 2 midpoint evaluations, 2 encounters
    separate.record(identity(0), 'status', full(5), u32(states));
    separate.record(identity(0), 'normal', full(5), normals([false, true, true, false, true]));
    separate.record(identity(0), 'lightingStatus', full(5), u32([0, 0, 0, 0, 0]));
    if (recovery) separate.record(identity(0), 'recovery', full(5), u32([recovered, 0, 0, 0, 0]));
    const packet = u32(states.flatMap((status, i) => [status, 0x41540000 | ([false, true, true, false, true][i] ? 1 : 0), ...(recovery ? [i ? 0 : recovered] : [])]));
    packed.recordDraft(identity(0), full(5), packet);
    assert.deepEqual(packed.end(identity(0)), separate.end(identity(0)));
    assert.deepEqual(packed.snapshot(), separate.snapshot());
    assert.deepEqual(packed.unionBits(), separate.unionBits());
    assert.deepEqual(packed.unionReasons(), separate.unionReasons());
  }
});

test('packed draft diagnostics reject missing coverage malformed length duplicate pixels and stale identity', () => {
  const masks = createOutcomeMasks({ width: 2, height: 1 });
  assert.equal(typeof masks.recordDraft, 'function');
  assert.throws(() => masks.recordDraft(identity(0), full(2), u32([HIT, 0x41540001])), /bytes|length/);
  assert.throws(() => masks.recordDraft(identity(0), full(1), u32([HIT, 0])), /coverage/);
  masks.recordDraft(identity(0), full(1), u32([HIT, 0x41540000]));
  assert.throws(() => masks.recordDraft(identity(0), full(1), u32([HIT, 0x41540000])), /twice/);
  assert.throws(() => masks.recordDraft(identity(0, 'wrong'), { x: 1, y: 0, width: 1, height: 1 }, u32([MISS, 0x41540001])), /stale/);
  assert.throws(() => masks.end(identity(0)), /incomplete/);
});

test('packed GPU equivalence check requires present recovery words and rejects packets that omit them', async () => {
  const { checkPackedDiagnostics, patternRecoveryWord } = await import('../support/packed-diagnostics.mjs');
  const size = { width: 52, height: 4 }, pixels = size.width * size.height;
  const statusOf = x => ({ 0: packStatus({ status: 0, reason: 0, subreason: 0, steps: 4 }), 2: packStatus({ status: 2, reason: 1, subreason: 0, steps: 4 }),
    3: packStatus({ status: 2, reason: 2, subreason: 0, steps: 4 }), 8: packStatus({ status: 3, reason: 0, subreason: 0, steps: 4 }) })[Math.floor(x / 4) % 13] ?? 1;
  const status = new Uint32Array(pixels), normal = new Uint16Array(pixels * 4), recovery = new Uint32Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const x = i % size.width, y = Math.floor(i / size.width);
    status[i] = statusOf(x); recovery[i] = patternRecoveryWord(x, y); if ((status[i] & 15) === 0) normal[i * 4 + 3] = 0x3c00;
  }
  const pack = recoveryOf => { const p = new Uint32Array(pixels * 3); for (let i = 0; i < pixels; i++) { p[3 * i] = status[i]; p[3 * i + 1] = 0x41540000 | (normal[i * 4 + 3] ? 1 : 0); p[3 * i + 2] = recoveryOf(i); } return p; };
  const u8 = a => new Uint8Array(a.buffer), display = new Uint8Array(pixels * 4);
  const input = (packet, recoveryWords = recovery) => ({ size, recovery: true, packet: u8(packet), status: u8(status), normal: u8(normal),
    lightingStatus: new Uint8Array(pixels * 4), recoveryWords: u8(recoveryWords), display, packedDisplay: display });
  const good = checkPackedDiagnostics(input(pack(i => recovery[i])));
  assert.ok(good.recovery.attempts > 0 && good.recovery.outcomes['point-budget'] > 0 && Object.values(good.recovery.stops).every(n => n > 0));
  assert.throws(() => checkPackedDiagnostics(input(pack(() => 0))), /recovery/, 'omitted recovery packing');
  assert.throws(() => checkPackedDiagnostics(input(pack(i => recovery[(i + 1) % pixels]))), /recovery/, 'misplaced recovery packing');
  assert.throws(() => checkPackedDiagnostics(input(pack(() => 0), new Uint32Array(pixels))), /fixture recovery word present/, 'an all-zero recovery fixture is not evidence');
});


// These are algorithm/contract checks, not timing tests. The script maskbench.mjs
// measures wall time separately; aligned Worker inputs must not decode via DataView.
test('B15-R24 Worker fast path matches the decoder without per-pixel DataView reads', () => {
  const size = { width: 65, height: 17 }, region = { x: 0, y: 0, ...size }, pixels = size.width * size.height;
  const states = [HIT, MISS, FAILED, 0x12, 0x22, 0x32, 0x142, 0x242, 0x12, 0x12, 0x12];
  const words = [0x122, 0, 0x211, 0x1418, 0x311, 0, 0, 0, 0x2418, 0x3418, 0x4418];
  for (const recovery of [false, true]) for (const packed of [false, true]) {
    const oracle = createOutcomeMasks(size, { recovery, strict: true, producerToken: 19 });
    const fast = createWorkerOutcomeMasks(size, { recovery, strict: true, producerToken: 19 });
    for (const accumulationKey of ['first', 'replacement']) for (let n = 0; n < 3; n++) {
      const id = identity(n, accumulationKey), state = Array.from({ length: pixels }, (_, i) => (i + n) % states.length);
      // Alternating normal/status order and sample reasons exercise both joint normal counts and unions.
      const fields = packed ? [['draftDiagnostics', u32(state.flatMap((v, i) => [states[v], 38 | (i % 3 ? 1 : 0), ...(recovery ? [words[v]] : [])]))]]
        : [['status', u32(state.map(v => states[v]))], ['normal', normals(state.map((_, i) => i % 3 !== 0))],
          ['lightingStatus', u32(state.map((_, i) => i % 3 ? AO_FAILED : AO_UNRESOLVED | SHADOW_UNRESOLVED))],
          ...(recovery ? [['recovery', u32(state.map(v => words[v]))]] : [])];
      if (n % 2) fields.reverse();
      for (const [field, bytes] of fields) oracle.ingestSync(id, field, region, bytes);
      let reads = 0;
      const get16 = DataView.prototype.getUint16, get32 = DataView.prototype.getUint32;
      try {
        DataView.prototype.getUint16 = function (...args) { reads++; return get16.apply(this, args); };
        DataView.prototype.getUint32 = function (...args) { reads++; return get32.apply(this, args); };
        for (const [field, bytes] of fields) fast.ingestSync(id, field, region, bytes);
      } finally { DataView.prototype.getUint16 = get16; DataView.prototype.getUint32 = get32; }
      assert.deepEqual(fast.counts(), oracle.counts());
      assert.deepEqual(fast.snapshot(), oracle.snapshot());
      assert.deepEqual(fast.unionBits(), oracle.unionBits());
      assert.deepEqual(fast.unionReasons(), oracle.unionReasons());
      assert.equal(fast.closed(id), true);
      assert.equal(reads, 0, 'aligned Worker decode must use typed-array views, not per-pixel DataView reads');
    }
  }
});

test('B15-R24 Worker fast path preserves malformed-input and recovery failures', () => {
  // Compare error type AND message at the same operation, including strict and
  // non-strict status semantics, draft markers, coverage and every recovery rule.
  const cases = [
    m => m.record(identity(0), 'unknown', full(1), u32([0])),
    m => m.record(identity(0), 'status', full(3), u32([0, 0, 0])),
    m => m.record(identity(0), 'status', full(2), u32([0])),
    m => m.record(identity(-1), 'status', full(2), u32([0, 0])),
    m => m.record(identity(1), 'status', full(2), u32([0, 0])),
    m => { m.record(identity(0), 'status', full(2), u32([0, 0])); m.record(identity(0), 'status', full(1), u32([0])); },
    m => { m.record(identity(0), 'status', full(1), u32([0])); m.record(identity(0, 'stale'), 'normal', full(1), normals([true])); },
    m => m.record(identity(0), 'status', full(2), u32([0, 15])),
    m => m.record(identity(0), 'status', full(2), u32([0, 0x72])),
    m => { m.record(identity(0), 'status', full(2), u32([0, 0])); m.end(identity(0)); },
    m => m.end(identity(0)),
    m => m.recordDraft(identity(0), full(2), u32([0, 0x41540001])),
    m => m.recordDraft(identity(0), full(1), u32([0, 0])),
    m => { m.recordDraft(identity(0), full(1), u32([0, 0x41540001])); m.recordDraft(identity(0), full(1), u32([0, 0x41540001])); },
    m => m.recordDraft(identity(0), full(1), u32([0x72, 0x41540001])),
    m => m.record(identity(0), 'recovery', full(2), u32([0, 0])),
  ];
  for (const strict of [false, true]) for (const run of cases) {
    const result = factory => {
      const m = factory({ width: 2, height: 1 }, { strict });
      try { run(m); return { counts: m.counts(), snapshot: m.snapshot() }; }
      catch (error) { return { name: error.name, message: error.message }; }
    };
    assert.deepEqual(result(createWorkerOutcomeMasks), result(createOutcomeMasks));
  }
  for (const [status, word] of [[HIT, 0x10111], [HIT, 0x511], [MISS, 0x111], [0x32, 0x311],
    [0x22, 0x1411], [0x12, 0x411], [HIT, 0x1111], [0x12, 0x5411], [HIT, 0x119]]) {
    const result = factory => {
      const m = factory({ width: 1, height: 1 }, { recovery: true, strict: true });
      m.record(identity(0), 'status', full(1), u32([status]));
      m.record(identity(0), 'normal', full(1), normals([true]));
      m.record(identity(0), 'lightingStatus', full(1), u32([0]));
      m.record(identity(0), 'recovery', full(1), u32([word]));
      try { m.end(identity(0)); assert.fail('invalid recovery was accepted'); }
      catch (error) { assert.match(error.message, /recovery word/); return [error.name, error.message]; }
    };
    assert.deepEqual(result(createWorkerOutcomeMasks), result(createOutcomeMasks));
  }
});

test('B15-R24 Worker fast path preserves unaligned tiled inputs reset and snapshot isolation', () => {
  const oracle = createOutcomeMasks({ width: 3, height: 2 }, { strict: true });
  const fast = createWorkerOutcomeMasks({ width: 3, height: 2 }, { strict: true });
  for (let n = 0; n < 3; n++) {
    const id = identity(n);
    for (const field of ['normal', 'lightingStatus', 'status']) for (let y = 1; y >= 0; y--) for (let x = 2; x >= 0; x--) {
      const source = field === 'normal' ? normals([x % 2]) : u32([field === 'status' ? (x + y + n) % 4 === 2 ? 0x12 : (x + y + n) % 4 : AO_UNRESOLVED]);
      const bytes = new Uint8Array(source.length + 3).subarray(1, source.length + 1); bytes.set(source);
      const region = { x, y, width: 1, height: 1 };
      fast.record(id, field, region, bytes); oracle.record(id, field, region, bytes);
      assert.deepEqual(fast.counts(), oracle.counts());
      for (let i = 0; i < 6; i++) { assert.equal(fast.hitAt(i), oracle.hitAt(i)); assert.equal(fast.statusSeen(i), oracle.statusSeen(i)); }
    }
    assert.deepEqual(fast.end(id), oracle.end(id));
    assert.deepEqual(fast.snapshot(), oracle.snapshot());
    const copy = fast.snapshot(); copy.union.hits = -1;
    assert.deepEqual(fast.snapshot(), oracle.snapshot());
    for (const masks of [fast, oracle]) {
      assert.throws(() => masks.record(id, 'status', full(1), u32([0])), /order/);
      assert.throws(() => masks.record(identity(n + 2), 'status', full(1), u32([0])), /order/);
    }
  }
  fast.reset(); oracle.reset();
  assert.deepEqual(fast.snapshot(), oracle.snapshot()); assert.deepEqual(fast.counts(), oracle.counts());
  assert.deepEqual(fast.unionBits(), oracle.unionBits()); assert.deepEqual(fast.unionReasons(), oracle.unionReasons());
});


test('B15-R24 Worker decoder preserves permissive words and unaligned packed drafts', () => {
  // The status ABI ignores upper bits on hits/misses; non-strict full decode
  // retains unspecified reasons. Normal alpha treats negative zero as absent.
  const states = [0xfffffff0, 0xfffffff1, 0x72, 0x42, 0x342, 3],
    alphas = [0x8000, 0, 0x3c00, 0xfc00, 1, 0x7fff];
  for (const packed of [false, true]) for (const offset of [0, 1, 2, 4]) {
    const a = createOutcomeMasks({ width: 6, height: 1 }), b = createWorkerOutcomeMasks({ width: 6, height: 1 });
    const aligned = bytes => { const backing = new Uint8Array(bytes.length + offset + 4); backing.set(bytes, offset); return backing.subarray(offset, offset + bytes.length); };
    const fields = packed ? [['draftDiagnostics', u32(states.map(s => (s & 15) === 2 ? 0x12 : s).flatMap((s, i) => [s, 0x41540000 | (i % 2)]))]]
      : [['normal', new Uint8Array(Uint16Array.from(alphas.flatMap(alpha => [0, 0, 0, alpha])).buffer)],
        ['status', u32(states)], ['lightingStatus', u32([0, 0xffffffff, 0x73, 0x1023, 0x80000000, 0])]];
    for (const [field, bytes] of fields) for (const m of [a, b]) m.ingestSync(identity(0), field, full(6), aligned(bytes));
    assert.deepEqual(b.counts(), a.counts()); assert.deepEqual(b.snapshot(), a.snapshot());
    assert.deepEqual(b.unionBits(), a.unionBits()); assert.deepEqual(b.unionReasons(), a.unionReasons());
  }
});
