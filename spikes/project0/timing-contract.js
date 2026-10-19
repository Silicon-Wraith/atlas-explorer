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
// raw field must be a finite, nonnegative number in the record's raw payload.
export const CORRECTNESS_ONLY = Object.freeze({ kind: 'correctness-only' });
export const notMeasured = reason => ({ kind: 'not-measured', reason });

// What traceList's workMs measures (gpu/webgpu.js re-exports it as TRACE_LIST_TIMING): t0 is taken before the batch loop, so it includes CPU
// batch preparation, encoding and submission, and ends when the last onSubmittedWorkDone resolves. Queue-completion time, not shader time.
export const QUEUE_COMPLETION_WORKMS = Object.freeze({ kind: 'queue-completion', clock: 'page.performance.now', unit: 'ms', field: 'workMs', start: 'before the first batch is prepared', end: 'after the final onSubmittedWorkDone promise resolves', readbackIncluded: false, timestampQueriesUsed: false });

// The expected timing method of every completed record, by gate (or experiment): the list of descriptors a completed slot may carry, matched
// exactly. A gate that is not listed fails closed. T7-T9 add their gates' rows here (see the T6 report, "Fix round 4"); rows are never loosened.
const freeze = list => Object.freeze(list.map(d => Object.freeze({ ...d })));
export const EXPECTED_TIMING = Object.freeze({
  G3: freeze([QUEUE_COMPLETION_WORKMS]),
  G4: freeze([CORRECTNESS_ONLY]),
  G5: freeze([CORRECTNESS_ONLY]),
  'derivative-policy': freeze([CORRECTNESS_ONLY]),
  probe: freeze([CORRECTNESS_ONLY]),
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

// Shape and meaning of one record's timing method. `record` needs gate, slot, timingMethod and invalidations. `raw` is the record's parsed raw
// payload: pass it whenever it is available; `undefined` means "not supplied" and skips only the raw-value check, `null` means "the record has
// no raw payload" and fails any measured descriptor. Throws `timing method: ...`; returns the descriptor.
export function validateRecordTiming(record, raw) {
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
  if (match.field && raw !== undefined) {
    if (raw === null || typeof raw !== 'object') fail(`${gate}/${slot}: no raw payload holds ${match.field}`);
    const v = raw[match.field];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) fail(`${gate}/${slot}: ${match.field} must be a finite nonnegative number, not ${JSON.stringify(v)}`);
  }
  return tm;
}
