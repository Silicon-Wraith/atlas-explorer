// spikes/project0/timing-contract.js — the timing-method contract (globals: every record names its timing method), shared by the record
// writer (evidence.mjs writeRecord, run.mjs finalise) and the read-time evaluator (gates-checked.js). Pure: no Node or browser APIs, so the
// page drivers, the Node writers and the evaluators import one definition. T1's frozen contract.js does not check timingMethod; this does.
//
// Shapes (validateTimingMethod):
// - measured: { kind, clock, unit, field, start, end, readbackIncluded, timestampQueriesUsed }, all required, nothing else. `field` names the
//   raw value it describes; timestampQueriesUsed must be true exactly when kind is 'timestamp-query'.
// - CORRECTNESS_ONLY = { kind: 'correctness-only' }: the record carries no timing measurement.
// - notMeasured(reason) = { kind: 'not-measured', reason }: no measurement is available.
// Meaning (validateRecordTiming): the shape must also be the one the record's gate expects (EXPECTED_TIMING), and a measured descriptor's
// raw field must be a finite, nonnegative number in the record's raw payload, which is always required. inspectTimingDescriptor checks the
// descriptor alone, for diagnostics, and never supports a verdict.
export const CORRECTNESS_ONLY = Object.freeze({ kind: 'correctness-only' });
export const notMeasured = reason => ({ kind: 'not-measured', reason });

// What traceList's workMs measures (gpu/webgpu.js re-exports it as TRACE_LIST_TIMING): t0 is taken before the batch loop, so it includes CPU
// batch preparation, encoding and submission, and ends when the last onSubmittedWorkDone resolves. Queue-completion time, not shader time.
export const QUEUE_COMPLETION_WORKMS = Object.freeze({ kind: 'queue-completion', clock: 'page.performance.now', unit: 'ms', field: 'workMs', start: 'before the first batch is prepared', end: 'after the final onSubmittedWorkDone promise resolves', readbackIncluded: false, timestampQueriesUsed: false });

// T9: the in-page timing gates. Every gate duration is measured on the page clock (performance.now(), one time origin per page) between page
// events; none uses GPU timestamp queries, so timestampQueriesUsed is false throughout. Renderer.readTimestamps() feeds only the per-trial
// band diagnostics (raw.diagnostics.timestampQuery, reported separately from raw.diagnostics.queueCompletion), which no gate rule reads.
// Every publication time is the renderer's `publish` event, marked after the frame's counts readback (a 32-byte mapAsync) has resolved, so
// readback is included wherever a publication ends the measurement. Node derives every gate metric from the raw events; `field` names the
// top-level page-clock value each driver records for its measured interval, which the timing contract requires to be finite and nonnegative.
const pageClock = (field, start, end, readbackIncluded = true) => Object.freeze({ kind: 'page-clock', clock: 'page.performance.now', unit: 'ms', field, start, end, readbackIncluded, timestampQueriesUsed: false });
export const G2_NAVIGATION_TIMING = pageClock('navigationMs', 'navigation start: the page time origin (performance.now() = 0); the driver runs at module evaluation with no Node round trip',
  'the publish event (frame.t) of the first bulb-overview draft frame, after its counts readback');
export const G6_WINDOW_TIMING = pageClock('observedMs', 'windowStart: performance.now() when the measured 30 s path starts, before its first render() (the 3 s warm-up path is excluded)',
  'performance.now() in the publish handler of the first publication at or after 30 s, which ends the path; published and intervalP95 come from the publish events (frames[].t, each after its counts readback) in [windowStart, windowStart + 30000)');
export const G7_BURST_TIMING = pageClock('observedMs', 'windowStart: the burst schedule origin t0 (performance.now() + 50 ms when the schedule is armed; request i is scheduled at t0 + offsetMs)',
  'performance.now() after the trailing quiet period; latencyP95 is each final request\'s publish event (publishedMs, after its counts readback) minus its request event (requestedMs, at render() entry)');
export const G8_REPLACEMENT_TIMING = pageClock('latencyMs', 'sphereRequested: performance.now() immediately before the sphere render() call, after the stress request\'s submit event was observed',
  'the sphere frame\'s publish event (sphere.t), after its counts readback');
export const G9_LONG_TASK_TIMING = Object.freeze({ kind: 'long-task-timing', clock: 'page.performance.now', unit: 'ms', field: 'longestTaskMs',
  start: 'each PerformanceObserver longtask entry\'s startTime, within the twelve G6 and G7 measured windows (drained with takeRecords() before each window is summarised)',
  end: 'startTime + duration (the browser\'s PerformanceLongTaskTiming.duration); longestTaskMs is the longest recorded task (0 when none), and the gate counts tasks over 50 ms by kind',
  readbackIncluded: false, timestampQueriesUsed: false });
export const G10_SETTLED_TIMING = pageClock('elapsedMs', 'requestedMs: performance.now() immediately before renderOnce() issues the settled request',
  'the settled frame\'s publish event (frame.t), after its counts readback');
export const G12_WALL_TIMING = pageClock('wallMs', 'performance.now() after the baseline is recorded and integrity observation starts, before cycle 0',
  'performance.now() after the last cycle\'s checkpoint (the span includes every cycle\'s publications and the maintenance readbacks)');

// T12: the precision experiment (browser/drivers/precision.js). Its cost evidence is nested per distance and implementation, as samples the
// contract's top-level field cannot name: the field is the page-clock span of the whole matched cost protocol, which contains every sample, and
// the start and end texts state exactly what each nested workMs and readMs sample measures. No GPU timestamp queries are used.
export const PRECISION_COST_TIMING = Object.freeze({ kind: 'page-clock', clock: 'page.performance.now', unit: 'ms', field: 'costProtocolMs',
  start: 'costStart: performance.now() after the primitive validation has been read back and its resources released, before the first distance\'s inputs are packed. Inside the span, per distance, fixtures.costProtocol.warmups unrecorded and then fixtures.costProtocol.measured recorded runs alternate baseline (traceList) then compensated (trace_ff_list); each recorded run of each implementation contributes one workMs sample (queue-completion time from before the first batch is prepared, after the input buffers are uploaded, to after the final onSubmittedWorkDone promise resolves; readback excluded) and one readMs sample (readBack(): from before the staging buffer is allocated, through the copy submission and its onSubmittedWorkDone, to after mapAsync resolves and the mapped range is copied and unmapped)',
  end: 'performance.now() after the last distance\'s runs and the release of its allocators; costProtocolMs = end - costStart, so it includes every warm-up, every readback and the host work between runs. The nested workMs and readMs samples are the cost evidence (medians and ranges, measure/precision.mjs); costProtocolMs only bounds them',
  readbackIncluded: true, timestampQueriesUsed: false });

// The expected timing method of every completed record, by gate (or experiment): the list of descriptors a completed slot may carry, matched
// exactly. A gate that is not listed fails closed. T7-T9 add their gates' rows here (see the T6 report, "Fix round 4"); rows are never loosened.
const freeze = list => Object.freeze(list.map(d => Object.freeze({ ...d })));
export const EXPECTED_TIMING = Object.freeze({
  G3: freeze([QUEUE_COMPLETION_WORKMS]),
  G4: freeze([CORRECTNESS_ONLY]),
  G5: freeze([CORRECTNESS_ONLY]),
  'derivative-policy': freeze([CORRECTNESS_ONLY]),
  probe: freeze([CORRECTNESS_ONLY]),
  smoke: freeze([CORRECTNESS_ONLY]),                     // T7: the viewport smoke experiment; its raw per-frame ms are development observations, not timing evidence
  G11: freeze([CORRECTNESS_ONLY]),                       // T8: A.8 resource verification; every rule bounds bytes or counts, none a duration
  G13: freeze([CORRECTNESS_ONLY]),                       // T8: loss and recovery; every rule is a count or flag; the raw page-clock `t` stamps are not timing evidence
  G1: freeze([CORRECTNESS_ONLY]),                        // T9: adapter identity and corroboration; every rule is a flag
  G2: freeze([G2_NAVIGATION_TIMING]),                    // T9: navigationMs (range 0..10000 on the fresh runs)
  G6: freeze([G6_WINDOW_TIMING]),                        // T9: windowMs, published and intervalP95 from publication events
  G7: freeze([G7_BURST_TIMING]),                         // T9: latencyP95 from request and publish events
  G8: freeze([G8_REPLACEMENT_TIMING]),                   // T9: latencyMs (range 0..250)
  G9: freeze([G9_LONG_TASK_TIMING]),                     // T9: long-task counts over 50 ms
  G10: freeze([G10_SETTLED_TIMING]),                     // T9: elapsedMs (range 0..2000)
  G12: freeze([G12_WALL_TIMING]),                        // T9: wallMs (at least 600000)
  visible: freeze([CORRECTNESS_ONLY]),                   // T9: visible-output evidence (an experiment): colour classes and captures, no timing
  precision: freeze([PRECISION_COST_TIMING]),            // T12: the A.10/A.11 experiment; costProtocolMs spans the nested workMs/readMs samples
});

const MEASURED_FIELDS = ['kind', 'clock', 'unit', 'field', 'start', 'end', 'readbackIncluded', 'timestampQueriesUsed'];
const fail = why => { throw new Error(`timing method: ${why}`); };

// Shape only. `slot === 'incomplete'` admits only not-measured.
export function validateTimingMethod(tm, { slot } = {}) {
  if (tm === undefined || tm === null || typeof tm !== 'object' || Array.isArray(tm)) fail('missing (the producer must supply one)');
  if (typeof tm.kind !== 'string' || !tm.kind) fail('no kind');
  const only = allowed => { for (const k of Object.keys(tm)) if (!allowed.includes(k)) fail(`unexpected field ${k} for kind ${tm.kind}`); };
  if (tm.kind === 'not-measured') { only(['kind', 'reason']); if (typeof tm.reason !== 'string' || !tm.reason) fail('not-measured needs a reason'); return tm; }
  if (slot === 'incomplete') fail(`an incomplete record must be not-measured, not ${tm.kind}`);
  if (tm.kind === 'correctness-only') { only(['kind']); return tm; }
  only(MEASURED_FIELDS);
  for (const k of ['clock', 'unit', 'field', 'start', 'end']) if (typeof tm[k] !== 'string' || !tm[k]) fail(`measured kind ${tm.kind} needs ${k}`);
  for (const k of ['readbackIncluded', 'timestampQueriesUsed']) if (typeof tm[k] !== 'boolean') fail(`measured kind ${tm.kind} needs boolean ${k}`);
  if (tm.timestampQueriesUsed !== (tm.kind === 'timestamp-query')) fail(`inconsistent: kind ${tm.kind} with timestampQueriesUsed ${tm.timestampQueriesUsed}`);
  return tm;
}

// Exact equality for descriptors, whose values are strings and booleans only.
const same = (a, b) => { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]); };
const describe = d => d.kind === 'correctness-only' || d.kind === 'not-measured' ? d.kind : `${d.kind} of ${d.field} (${d.clock}, ${d.unit})`;

// Descriptor-only inspection: shape and the gate's expected descriptor, without the raw measurement. For diagnostics only; it never
// supports a verdict (gates-checked.js uses validateRecordTiming). Throws `timing method: ...`; returns the matched expected descriptor.
export function inspectTimingDescriptor(record) {
  const { gate, slot, timingMethod: tm } = record ?? {};
  validateTimingMethod(tm, { slot });
  if (slot === 'incomplete') return tm;
  if (tm.kind === 'not-measured') {
    // Only finalise's fail-closed shape: a completed slot whose own descriptor was refused keeps its evidence beside an explicit invalidation.
    if (!Array.isArray(record.invalidations) || !record.invalidations.some(x => typeof x === 'string' && /^timing method: /.test(x))) fail(`${gate}/${slot}: a completed slot may be not-measured only beside a timing-method invalidation`);
    return tm;
  }
  const expected = Object.hasOwn(EXPECTED_TIMING, gate) ? EXPECTED_TIMING[gate] : null;
  if (!expected) fail(`no expected timing method registered for ${gate}`);
  const match = expected.find(d => same(d, tm));
  if (!match) fail(`${gate}/${slot} expects ${expected.map(describe).join(' or ')}, not ${describe(tm)}`);
  return match;
}

// Shape and meaning of one record's timing method, including its raw measurement. `record` needs gate, slot, timingMethod and invalidations;
// `raw` is the record's parsed raw payload. A measured descriptor needs a raw object whose named field is a finite, nonnegative number: a
// missing, undefined or null raw is refused, never skipped. Throws `timing method: ...`; returns the descriptor.
export function validateRecordTiming(record, raw) {
  const match = inspectTimingDescriptor(record);
  const { gate, slot, timingMethod: tm } = record;
  if (slot === 'incomplete' || tm.kind === 'not-measured' || !match.field) return tm;
  if (raw === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw)) fail(`${gate}/${slot}: no raw payload holds ${match.field}`);
  const v = raw[match.field];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) fail(`${gate}/${slot}: ${match.field} must be a finite nonnegative number, not ${JSON.stringify(v)}`);
  return tm;
}
