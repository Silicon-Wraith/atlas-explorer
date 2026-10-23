// P3 acceptance policy only. scheduleAbsolute and its other consumers stay strict.
export const PERFORMANCE_EVIDENCE_SCHEMA_VERSION = 5;
export const P3_TIMING_POLICY = 'atlas.p3-timing-budget-v1';

// The frozen workload's input identities and phase-local target offsets. A test
// checks every scene's materialized schedule against this policy definition.
const PHASES = Object.freeze([
  { name: 'orbit', first: 0, count: 1875, spacingMs: 16 },
  { name: 'interaction', first: 1, count: 400, spacingMs: 60 },
  { name: 'stress', first: 0, count: 40, spacingMs: 250 },
]);
const EXPECTED_INPUT_COUNT = PHASES.reduce((sum, phase) => sum + phase.count, 0);

export function assessPerformanceTiming(trial) {
  const issued = Array.isArray(trial?.issued) ? trial.issued : [];
  let evidenceError = null, lateOver4Count = 0, maxLateByMs = null;
  const invalid = reason => { evidenceError ??= reason; };
  if (!Array.isArray(trial?.issued) || issued.length !== EXPECTED_INPUT_COUNT) invalid('incomplete frozen input schedule');
  if (!Number.isFinite(trial?.timeOriginMs) || trial.timeOriginMs < 0) invalid('missing or malformed clock origin');

  // Count all raw observations, even in an invalid attempt; never replace, round
  // or delete a timestamp, and never trust a cached summary to grant acceptance.
  let previousIssuedAt = -Infinity;
  for (const input of issued) {
    if (!Number.isFinite(input?.target) || !Number.isFinite(input?.issuedAt)) {
      invalid('missing or malformed issuance timestamp'); continue;
    }
    const late = input.issuedAt - input.target;
    if (late > 4) lateOver4Count++;
    maxLateByMs = Math.max(maxLateByMs ?? 0, late);
    if (late < 0) invalid('early input issuance');
    if (input.lateByMs !== late) invalid('inconsistent raw lateness');
    if (input.issuedAt < previousIssuedAt) invalid('out-of-order input observation');
    previousIssuedAt = input.issuedAt;
  }

  let position = 0, previousEnd = -Infinity;
  for (const phase of PHASES) {
    const window = trial?.phases?.[phase.name];
    if (!Number.isFinite(window?.start) || !Number.isFinite(window?.end) || window.start < 0 || window.end < window.start || window.start < previousEnd) {
      invalid('missing or malformed phase window');
    }
    previousEnd = window?.end ?? previousEnd;
    for (let offset = 0; offset < phase.count; offset++, position++) {
      const input = issued[position], index = phase.first + offset;
      if (input?.phase !== phase.name || input?.index !== index) invalid('missing, duplicate or out-of-order input identity');
      if (input?.target !== window?.start + index * phase.spacingMs) invalid('input target differs from the frozen schedule');
      if (input?.issuedAt > window?.end) invalid('input outside its phase window');
    }
  }
  return {
    timingPolicy: P3_TIMING_POLICY, expectedInputCount: EXPECTED_INPUT_COUNT, observedInputCount: issued.length,
    lateOver4Count, maxLateByMs, strictInvalidated: lateOver4Count > 0,
    policyInvalidated: Boolean(evidenceError) || lateOver4Count > 3 || maxLateByMs > 8,
    evidenceError,
    rearms: Array.isArray(trial?.timings) ? trial.timings.reduce((sum, timing) => sum + (timing?.rearms ?? 0), 0) : 0,
  };
}
