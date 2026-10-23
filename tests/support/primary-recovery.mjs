// A binary32 mirror of trace.wgsl march() for one ray, including the §11.4 quaternion-primary bounded recovery
// (spec rev 5.1, user-approved 2026-10-22; plan B11b "Rev 5.1 follow-ups", FU2), and the scripted validation field
// (FIELD 6, validation only) whose cases drive every recovery path through the GPU trace_rays entry. Node-only test
// support: the GPU result of each scripted case must equal this mirror exactly (status, reason, subreason, steps,
// t and the recovery word); CPU agreement alone never qualifies the GPU (plan B11b protocol).
//
// Arithmetic: every elementary operation rounds to nearest binary32. The scripted rays use d = (1, 0, 0) and a zero
// low part, so the field input (high + t·d) + low is fround(high_x + t) whether or not the kernel fuses it, and the
// midpoint a + (b − a)·0.5 rounds identically fused or unfused (the product by 0.5 is exact).
const f = Math.fround;
export const RECOVERY_MIDPOINT_LIMIT = 8;
export const RECOVERY_OUTCOMES = Object.freeze(['none', 'approximate hit', 'numerical failure', 'estimate-unavailable', 'point-budget']);
export const RECOVERY_STOPS = Object.freeze(['none', 'midpoint-limit', 'parameter-collapse', 'coordinate-collapse', 'evaluation-cap']);
const NO_RECOVERY = Object.freeze({ attempted: false, outcome: 'none', stop: 'none', midpoints: 0, encounters: 0 });

// The scripted field at a position x (the first field-input coordinate): x' = fround(x − kappa); x' < s0 is an
// exterior estimate 2^logD; s0 <= x' < s1 is the band (0 an estimate 2^-40, a hit at any admitted τ; 1 a numerical
// failure; 2 an escaped orbit without a usable estimate); x' >= s1 has not escaped within the budget.
export const SCRIPTED_BANDS = Object.freeze({ hit: 0, numericalFailure: 1, estimateUnavailable: 2 });
export function scriptedSample(x, { C, kappa, power }) {
  const [s0, s1, logD] = C, v = f(x - kappa);
  if (v < s0) return { kind: 'log2', value: logD };
  if (v < s1) return power === SCRIPTED_BANDS.hit ? { kind: 'log2', value: -40 } : power === SCRIPTED_BANDS.numericalFailure ? { kind: 'failure' } : { kind: 'unavailable' };
  return { kind: 'not-escaped' };
}

// One ray: origin [ox, 0, 0], direction (1, 0, 0), explicit interval [enter, exit]; tolerance τ(t) = max(floor,
// factor·α·t); `primary` and `recovery` (the field is in the recovering family) gate the recovery.
export function marchMirror({ origin, interval, profile, sample, primary = true, recovery = true }) {
  const { maxSteps, stepMultiplier, toleranceFloor, toleranceFactor, alpha } = profile;
  const position = t => f(origin + t);
  const tolerance = t => Math.max(toleranceFloor, f(f(toleranceFactor * alpha) * t));
  const result = (status, reason, steps, t, extra = {}) => ({ status, reason, subreason: null, detail: null, steps, t, recovery: NO_RECOVERY, ...extra });
  let t = Math.max(0, interval.enter), p = position(t), tPrev = 0, pPrev = p;
  for (let steps = 1; steps <= maxSteps; steps++) {
    const s = sample(p);
    if (s.kind === 'failure') return result('numerical failure', null, steps, t);
    if (s.kind === 'not-escaped') {
      if (primary && recovery && steps >= 2) return recover({ position, tolerance, sample, maxSteps, a: tPrev, pa: pPrev, b: t, pb: p, steps });
      return result('unresolved', 'point-budget', steps, t);
    }
    if (s.kind === 'unavailable') return result('unresolved', 'estimate-unavailable', steps, t);
    // log2 estimates only (the scripted field is fractal-like)
    if (!Number.isFinite(s.value) || s.value >= 127) return result('unresolved', 'estimate-unavailable', steps, t);
    const tau = tolerance(t);
    if (tau >= 2 ** -126 && s.value < Math.log2(tau)) return result('approximate hit', null, steps, t);
    const advance = f(stepMultiplier * f(2 ** s.value)), candidate = f(t + advance);
    if (candidate > interval.exit) return result('miss', null, steps, t);
    if (!(candidate > t)) return result('unresolved', 'stagnation', steps, t, { subreason: 'ray-parameter' });
    const next = position(candidate);
    if (next === p) return result('unresolved', 'stagnation', steps, t, { subreason: 'field-coordinate' });
    tPrev = t; pPrev = p; t = candidate; p = next;
  }
  return result('unresolved', 'ray-step-budget', maxSteps, t);
}

// §11.4 recovery: a = the previous resolved parameter, b = the failed one; at most eight effective midpoints, each
// preceded by the budget, a < m < b and distinct-position checks; every midpoint counts as a primary evaluation.
function recover({ position, tolerance, sample, maxSteps, a, pa, b, pb, steps }) {
  const b0 = b;
  let midpoints = 0, encounters = 1, stop;
  const word = (outcome, extra = {}) => ({ attempted: true, outcome, stop: 'none', midpoints, encounters, ...extra });
  const end = (status, reason, t, outcome, extra = {}) => ({ status, reason, subreason: null, detail: null, steps, t, recovery: word(outcome), ...extra });
  for (;;) {
    if (midpoints >= RECOVERY_MIDPOINT_LIMIT) { stop = 'midpoint-limit'; break; }
    if (steps >= maxSteps) { stop = 'evaluation-cap'; break; }
    const m = f(a + f(f(b - a) * 0.5));
    if (!(a < m && m < b)) { stop = 'parameter-collapse'; break; }
    const pm = position(m);
    if (pm === pa || pm === pb) { stop = 'coordinate-collapse'; break; }
    steps++; midpoints++;
    const s = sample(pm);
    if (s.kind === 'failure') return end('numerical failure', null, m, 'numerical failure');
    if (s.kind === 'not-escaped') { encounters++; b = m; pb = pm; continue; }
    if (s.kind === 'unavailable' || !Number.isFinite(s.value) || s.value >= 127) return end('unresolved', 'estimate-unavailable', m, 'estimate-unavailable');
    const tau = tolerance(m);
    if (tau >= 2 ** -126 && s.value < Math.log2(tau)) return end('approximate hit', null, m, 'approximate hit');
    a = m; pa = pm;
  }
  return { status: 'unresolved', reason: 'point-budget', subreason: null, detail: null, steps, t: b0, recovery: word('point-budget', { stop }) };
}

// The scripted cases (frozen with the plan text; none is fitted to an acceptance scene). Profile: multiplier 0.9,
// τ = floor 1e-3 (factor 0), 64 steps unless stated. `expect` is the hand-derived path the mirror must reproduce.
const PROFILE = Object.freeze({ maxIterations: 128, maxSteps: 64, stepMultiplier: 0.9, toleranceFloor: 0.001, toleranceFactor: 0, alpha: 0 });
const ray = (origin, enter, exit) => ({ origin, interval: { enter, exit } });
export const SCRIPTED_RECOVERY_CASES = Object.freeze([
  { id: 'initial-point', ...ray(0, 0, 100), effective: { C: [-1, -1, 0, 0], kappa: 0, power: 0 },
    expect: { status: 'unresolved', reason: 'point-budget', steps: 1, attempted: false } },
  { id: 'success-b-update', ...ray(0, 0, 100), effective: { C: [2, 2.125, 0, 0], kappa: 0, power: SCRIPTED_BANDS.hit },
    expect: { status: 'approximate hit', steps: 6, attempted: true, outcome: 'approximate hit', midpoints: 2, encounters: 2 } },
  { id: 'success-a-update', ...ray(0, 0, 100), effective: { C: [2.375, 2.5, 0, 0], kappa: 0, power: SCRIPTED_BANDS.hit },
    expect: { status: 'approximate hit', steps: 6, attempted: true, outcome: 'approximate hit', midpoints: 2, encounters: 1 } },
  { id: 'numerical-failure', ...ray(0, 0, 100), effective: { C: [2, 2.125, 0, 0], kappa: 0, power: SCRIPTED_BANDS.numericalFailure },
    expect: { status: 'numerical failure', steps: 6, attempted: true, outcome: 'numerical failure', midpoints: 2 } },
  { id: 'estimate-unavailable', ...ray(0, 0, 100), effective: { C: [2, 2.125, 0, 0], kappa: 0, power: SCRIPTED_BANDS.estimateUnavailable },
    expect: { status: 'unresolved', reason: 'estimate-unavailable', steps: 6, attempted: true, outcome: 'estimate-unavailable', midpoints: 2 } },
  { id: 'midpoint-limit', ...ray(0, 0, 100), effective: { C: [2, 2, 0, 0], kappa: 0, power: 0 },
    expect: { status: 'unresolved', reason: 'point-budget', steps: 12, attempted: true, outcome: 'point-budget', stop: 'midpoint-limit', midpoints: 8 } },
  { id: 'evaluation-cap', ...ray(0, 0, 100), effective: { C: [2, 2, 0, 0], kappa: 0, power: 0 }, profile: { maxSteps: 6 },
    expect: { status: 'unresolved', reason: 'point-budget', steps: 6, attempted: true, outcome: 'point-budget', stop: 'evaluation-cap', midpoints: 2 } },
  { id: 'evaluation-cap-at-trigger', ...ray(0, 0, 100), effective: { C: [2, 2, 0, 0], kappa: 0, power: 0 }, profile: { maxSteps: 4 },
    expect: { status: 'unresolved', reason: 'point-budget', steps: 4, attempted: true, outcome: 'point-budget', stop: 'evaluation-cap', midpoints: 0 } },
  // t in [2^24, 2^25): the ulp is 2, the advance 0.9·2 rounds to one ulp, and the midpoint rounds onto an endpoint.
  { id: 'parameter-collapse', ...ray(-(2 ** 24), 2 ** 24, 2 ** 25), effective: { C: [3, 3, 1, 0], kappa: 0, power: 0 },
    expect: { status: 'unresolved', reason: 'point-budget', steps: 3, attempted: true, outcome: 'point-budget', stop: 'parameter-collapse', midpoints: 0 } },
  // A field input near 2^26 (ulp 8): the parameters differ, the midpoint's position rounds onto an endpoint's.
  { id: 'coordinate-collapse', ...ray(2 ** 26, 0, 100), effective: { C: [12, 12, 3, 0], kappa: 2 ** 26, power: 0 },
    expect: { status: 'unresolved', reason: 'point-budget', steps: 3, attempted: true, outcome: 'point-budget', stop: 'coordinate-collapse', midpoints: 0 } },
  // The same ray as success-b-update, flagged as a secondary ray: the recovery never applies.
  { id: 'secondary-unchanged', ...ray(0, 0, 100), effective: { C: [2, 2.125, 0, 0], kappa: 0, power: SCRIPTED_BANDS.hit }, secondary: true,
    expect: { status: 'unresolved', reason: 'point-budget', steps: 4, attempted: false } },
].map(c => Object.freeze({ ...c, profile: Object.freeze({ ...PROFILE, ...(c.profile ?? {}) }) })));

export function mirrorCase(c, { recovery = true } = {}) {
  return marchMirror({ origin: c.origin, interval: c.interval, profile: c.profile, sample: x => scriptedSample(x, c.effective), primary: !c.secondary, recovery });
}
// The comparable projection of a decoded GPU result or a mirror result.
export function comparable(r) {
  return { status: r.status, reason: r.reason ?? null, subreason: r.subreason ?? null, steps: r.steps, t: r.t,
    recovery: { attempted: r.recovery.attempted, outcome: r.recovery.outcome, stop: r.recovery.stop, midpoints: r.recovery.midpoints, encounters: r.recovery.encounters } };
}
