// spikes/project0/tests/timing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { posesAt, burstSchedule } from '../browser/paths.js';
import { pose, burstRequests } from '../reference/camera.js';
import { metricsFor } from '../measure/index.mjs';

const fixtures = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-12);

test('harness paths agree with the independent reference poses at every preparation phase', () => {
  for (const view of ['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005', 'bulb-stress', 'sphere'])
    for (const s of [...fixtures.motion.preparationPhases, 0.123, 29.999]) {
      const a = posesAt(fixtures, view, s), b = pose(view, s, fixtures.anchor);
      assert.ok(close(a.origin, b.origin) && close(a.target, b.target), `${view} @ ${s}s`);
    }
  const mine = burstSchedule(fixtures), ref = burstRequests();
  assert.equal(mine.length, 400);
  mine.forEach((r, i) => { assert.equal(r.offsetMs, ref[i].offsetMs); assert.ok(close(r.camera.origin, ref[i].camera.origin)); });
});

const draft = fixtures.profiles.draft, px = draft.W * draft.H;
const frame = (requestId, t, view = 'bulb-overview', total = px) => ({ requestId, t, view, label: view, W: draft.W, H: draft.H, counts: { total, hit: Math.round(total * 0.28), miss: total - Math.round(total * 0.28), point: 0, steps: 0, failure: 0 } });
const ok = { violations: [] };

test('G6: completion-driven publications in the window; partial frames and wrong-view frames are coverage errors', async () => {
  const frames = Array.from({ length: 950 }, (_, i) => frame(i + 1, 1000 + i * 31.5));
  frames[10] = frame(11, frames[10].t, 'bulb-overview', px - 1);
  frames[20] = frame(21, frames[20].t, 'sphere');                                    // a frame of another view, by its own label
  const m = await metricsFor('G6', 'bulb-overview/0', { windowStart: 1000, frames, pendingMax: 1, outstandingMax: 2, integrity: ok }, fixtures);
  assert.deepEqual(Object.keys(m).sort(), ['coverageErrors', 'intervalP95', 'outstandingMax', 'pendingMax', 'published', 'windowMs']);
  assert.equal(m.published, 950); assert.equal(m.coverageErrors, 2);
  await assert.rejects(metricsFor('G6', 'bulb-overview/0', { windowStart: 1000, frames, pendingMax: 1, outstandingMax: 2, integrity: { violations: ['window blurred at 12000'] } }, fixtures), /blurred/);
  await assert.rejects(metricsFor('G6', 'bulb-overview/0', { error: 'aborted: stall' }, fixtures), /driver error/);
});

function g7raw() {
  const issued = fixtures.bursts.requests.map((r, i) => {
    const scheduledMs = 1000 + r.offsetMs, firedMs = scheduledMs + 0.5, requestedMs = firedMs + 0.1;
    return { id: r.id, burst: r.burst, index: r.index, requestId: i + 1, scheduledMs, firedMs, requestedMs, submittedMs: requestedMs + 0.2, completedMs: requestedMs + 30, publishedMs: null, lateByMs: 0.5, lateCause: null };
  });
  const finals = issued.filter(r => r.index === 19);
  finals.forEach((r, b) => { r.publishedMs = r.requestedMs + 40 + b; r.completedMs = r.publishedMs - 1; });
  return { issued, frames: finals.map(r => frame(r.requestId, r.publishedMs)), outstandingMax: 2, integrity: ok };
}

test('G7: latency from each final request\'s own request event; the frozen schedule is matched one to one', async () => {
  const m = await metricsFor('G7', '0', g7raw(), fixtures);
  assert.equal(m.requests, 400); assert.equal(m.finals, 20); assert.equal(m.latencyP95, 58);
});

test('G7 refuses duplicates, schedule mismatches, missing publications and late issuance', async () => {
  const dup = g7raw(); dup.issued[5].requestId = dup.issued[4].requestId;
  await assert.rejects(metricsFor('G7', '0', dup, fixtures), /duplicate request identity/);
  const shuffled = g7raw(); [shuffled.issued[0], shuffled.issued[1]] = [shuffled.issued[1], shuffled.issued[0]];
  await assert.rejects(metricsFor('G7', '0', shuffled, fixtures), /frozen schedule/);
  const lost = g7raw(); lost.frames.pop();
  await assert.rejects(metricsFor('G7', '0', lost, fixtures), /never published/);
  const late = g7raw(); late.issued[33].firedMs += 10; late.issued[33].requestedMs += 10; late.issued[33].lateCause = 'application';
  await assert.rejects(metricsFor('G7', '0', late, fixtures), /schedule deviation: 1 requests .* \(application: 1\)/);
  const unknown = g7raw(); unknown.issued[50].firedMs += 9; unknown.issued[50].requestedMs += 9; unknown.issued[50].lateCause = 'unknown';
  await assert.rejects(metricsFor('G7', '0', unknown, fixtures), /\(unknown: 1\)/);
  const stretched = g7raw(); stretched.issued.forEach(r => { r.scheduledMs = 1000 + 100 * (r.scheduledMs - 1000); r.firedMs = r.scheduledMs + 0.5; r.requestedMs = r.firedMs + 0.1; r.submittedMs = r.requestedMs + 0.2; r.completedMs = r.requestedMs + 30; if (r.publishedMs !== null) { r.publishedMs = r.requestedMs + 40; r.completedMs = r.publishedMs - 1; } });
  stretched.frames = stretched.issued.filter(r => r.index === 19).map(r => frame(r.requestId, r.publishedMs));
  await assert.rejects(metricsFor('G7', '0', stretched, fixtures), /scheduled time differs from the frozen offset/);
  const shifted = g7raw(); shifted.issued.filter(r => r.burst === 7).forEach(r => { for (const k of ['scheduledMs', 'firedMs', 'requestedMs', 'submittedMs', 'completedMs']) r[k] += 25; if (r.publishedMs !== null) r.publishedMs += 25; });
  shifted.frames = shifted.issued.filter(r => r.index === 19).map(r => frame(r.requestId, r.publishedMs));
  await assert.rejects(metricsFor('G7', '0', shifted, fixtures), /request 140: scheduled time differs/);
  const truncated = g7raw(); truncated.issued.pop();
  await assert.rejects(metricsFor('G7', '0', truncated, fixtures), /expects 400 issued requests/);
});

test('G8: stressSubmitted comes from the exact stress submission event; the sphere frame must be the sphere request', async () => {
  const sphere = frame(2, 1200, 'sphere');
  const base = { stressRequestId: 1, stressSubmit: { requestId: 1, epoch: 1, t: 1000 }, sphereRequestId: 2, sphereRequested: 1050, sphere, stalePublications: 0, outstandingMax: 2, integrity: ok };
  const m = await metricsFor('G8', '0', base, fixtures);
  assert.equal(m.stressSubmitted, 1); assert.equal(m.latencyMs, 150); assert.equal(m.coverageErrors, 0);
  assert.equal((await metricsFor('G8', '0', { ...base, stressSubmit: null }, fixtures)).stressSubmitted, 0);
  assert.equal((await metricsFor('G8', '0', { ...base, sphere: frame(2, 1200, 'bulb-overview') }, fixtures)).coverageErrors, 1);
});

const sources = [...['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005'].flatMap(v => [0, 1, 2].map(i => ({ gate: 'G6', slot: `${v}/${i}` }))), ...['0', '1', '2'].map(slot => ({ gate: 'G7', slot }))]
  .map((x, i) => ({ ...x, windowStart: 1000 * i, windowEnd: 1000 * i + 900, valid: true }));   // T9 fix round 1: G9 names its twelve valid source windows
test('G9 validates task records and derives harness attribution from recorded measures', async () => {
  const tasks = [{ ms: 60, start: 1, kind: 'application' }, { ms: 51, start: 2, kind: 'harness' }, { ms: 40, start: 3, kind: 'application' }, { ms: 70, start: 4, kind: 'unattributed' }];
  assert.deepEqual(await metricsFor('G9', 'warmed', { windows: 12, sources, longTasks: tasks, harnessMeasures: 24 }, fixtures), { windows: 12, applicationOver50: 1, unattributedOver50: 1, harnessRecorded: 1 });
  assert.equal((await metricsFor('G9', 'warmed', { windows: 12, sources, longTasks: [], harnessMeasures: 0 }, fixtures)).harnessRecorded, 0);
  await assert.rejects(metricsFor('G9', 'warmed', { windows: 11, sources, longTasks: [], harnessMeasures: 1 }, fixtures), /12 observation windows/);
  await assert.rejects(metricsFor('G9', 'warmed', { windows: 12, sources, longTasks: [{ ms: 60, start: 1, kind: 'mystery' }], harnessMeasures: 1 }, fixtures), /malformed/);
});

test('G12 validates every maintenance exercise with the G11 rules', async () => {
  const R = fixtures.resources, textures = R.entries.filter(e => e.kind === 'texture').length;
  const good = { tableBytes: R.tableBytes, before: { bytes: 1, textures: 0, buffers: 1 }, after: { bytes: 1, textures: 0, buffers: 1 }, peakBytes: R.tableBytes + 1, written: Array(textures).fill(true), checks: Array.from({ length: R.readback.x.length * R.readback.y.length * textures }, () => ({ ok: true })), bandOk: true, fullBandBytes: 3932160, cancel: { before: 2, after: 0 }, outstandingMax: 2, errors: [] };
  const raw = { cycles: 60, wallMs: 600000, deadlineMisses: 0, unhandled: 0, unplannedLosses: 0, baseline: { bytes: 1000, textures: 4, buffers: 5 }, final: { bytes: 1000, textures: 4, buffers: 5 }, baselinePrepared: 1, returned1280: 1, outstandingMax: 2, integrity: ok, maintenance: Array(7).fill(good) };
  assert.equal((await metricsFor('G12', 'sequence', raw, fixtures)).maintenanceFailures, 0);
  assert.equal((await metricsFor('G12', 'sequence', { ...raw, maintenance: [...Array(6).fill(good), { ...good, bandOk: false }] }, fixtures)).maintenanceFailures, 1);
  await assert.rejects(metricsFor('G12', 'sequence', { ...raw, maintenance: Array(6).fill(good) }, fixtures), /maintenance record is incomplete/);
});
