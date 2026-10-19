// spikes/project0/tests/resources-metrics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricsFor } from '../measure/index.mjs';
import { maintenanceFailed } from '../measure/resources.mjs';
const fx = { resources: { tableBytes: 405995520, capBytes: 2 ** 30, entries: [...Array(7).fill({ kind: 'texture' }), { kind: 'buffer', count: 2, bytes: 7864320 }], readback: { x: [0, 1, 2], y: [0, 1, 2], fullBand: { width: 3840, height: 256, bytesPerRow: 15360 } } },
  views: { 'bulb-overview': {} }, profiles: { settled: { W: 1280, H: 720 } } };
const good = { tableBytes: 405995520, before: { bytes: 100, textures: 0, buffers: 1 }, after: { bytes: 100, textures: 0, buffers: 1 }, peakBytes: 406000000,
  written: Array(7).fill(true), checks: Array.from({ length: 63 }, () => ({ ok: true })), bandOk: true, fullBandBytes: 3932160,
  cancel: { before: 2, after: 0 }, outstandingMax: 2, errors: [] };

test('G11 metrics are recomputed from the raw observations', async () => {
  assert.deepEqual(await metricsFor('G11', '4k', good, fx), { tableBytes: 405995520, peakBytes: 406000000, texturesWritten: 7, selectedChecks: 63, mismatches: 0, fullBandBytes: 3932160, cancelled: 1, released: 1, outstandingMax: 2 });
  assert.equal((await metricsFor('G11', '4k', { ...good, after: { bytes: 0, textures: 0, buffers: 0 } }, fx)).released, 0);
  assert.equal((await metricsFor('G11', '4k', { ...good, cancel: { before: 2, after: 1 } }, fx)).cancelled, 0);
  assert.equal((await metricsFor('G11', '4k', { ...good, bandOk: false }, fx)).mismatches, 1);
  await assert.rejects(metricsFor('G11', '4k', { ...good, errors: ['allocation cap exceeded'] }, fx), /allocation cap exceeded/);
});

import { readFile } from 'node:fs/promises';
const real = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
test('a G12 maintenance exercise must satisfy every G11 rule; malformed evidence throws', () => {
  const fx = real;
  assert.equal(maintenanceFailed(good, fx), false);
  assert.equal(maintenanceFailed({ ...good, peakBytes: 2 ** 31 }, fx), true, 'peak allocation outside the G11 range');
  assert.equal(maintenanceFailed({ ...good, outstandingMax: 3 }, fx), true, 'more than two outstanding');
  assert.equal(maintenanceFailed({ ...good, fullBandBytes: 0 }, fx), true, 'full band missing');
  assert.throws(() => maintenanceFailed({ ...good, peakBytes: undefined }, fx), /missing or nonfinite/);
  assert.equal(maintenanceFailed({ ...good, bandOk: false }, fx), true);
  assert.equal(maintenanceFailed({ ...good, checks: good.checks.map((c, i) => ({ ok: i !== 7 })) }, fx), true);
  assert.equal(maintenanceFailed({ ...good, cancel: { before: 2, after: 1 } }, fx), true);
  assert.equal(maintenanceFailed({ ...good, after: { bytes: 99, textures: 0, buffers: 1 } }, fx), true);
  assert.throws(() => maintenanceFailed({ ...good, checks: good.checks.slice(1) }, fx), /63 selected checks/);
});

const frame = { requestId: 9, generation: 1, epoch: 6, view: 'bulb-overview', label: 'bulb-overview', W: 1280, H: 720, counts: { total: 921600, hit: 250000, miss: 671600, point: 0, steps: 0, failure: 0 } };
const raw = () => ({ kind: 'intentional', request: { view: 'bulb-overview', profile: 'settled' }, lostRequestId: 1, preserved: { view: 'bulb-overview', profile: 'settled' },
  submittedBeforeLoss: { requestId: 1, generation: 1, epoch: 4, batch: 1 }, loss: { epoch: 4, reason: 'destroyed', injected: false }, decision: 'recover', interrupted: true,
  publicationsOfLost: 0, latePublications: 0, recovery: { epoch: 6, requestId: 9, frame } });

test('G13 joins the exact submission, the loss and a complete recovery frame', async () => {
  assert.deepEqual(await metricsFor('G13', 'intentional', raw(), fx), { interrupted: 1, successes: 0, requestPreserved: 1, latePublications: 0, validRecovery: 1 });
  const partial = raw(); partial.recovery.frame.counts.total = 1000;
  assert.equal((await metricsFor('G13', 'intentional', partial, fx)).validRecovery, 0);
  const otherEpoch = raw(); otherEpoch.submittedBeforeLoss.epoch = 2;
  await assert.rejects(metricsFor('G13', 'intentional', otherEpoch, fx), /does not match the interrupted request and loss epoch/);
  const wrongKind = raw(); wrongKind.loss.injected = true;
  await assert.rejects(metricsFor('G13', 'intentional', wrongKind, fx), /unexpected loss kind/);
  await assert.rejects(metricsFor('G13', 'intentional', { ...raw(), error: 'timed out' }, fx), /driver error/);
  await assert.rejects(metricsFor('G13', 'intentional', { ...raw(), request: { view: 'bulb-stress', profile: 'settled' } }, fx), /frozen/);
  assert.deepEqual(await metricsFor('G13', 'repeated', { decision: 'stop', acquisitionsBefore: 3, acquisitionsAfter: 3 }, fx), { automaticRetriesAfterRepeat: 0 });
  assert.deepEqual(await metricsFor('G13', 'repeated', { decision: 'recover', acquisitionsBefore: 3, acquisitionsAfter: 4 }, fx), { automaticRetriesAfterRepeat: 2 });
});
