// spikes/project0/supervision-plan.js — the supervision plan and the frozen driver configuration (T9 fix rounds 2-3; reviewed plan amendments,
// Codex T9 r2/r3). Pure, so the page drivers, the Node supervisor (session-utils.mjs) and the evidence checks (measure/timing.mjs) share one
// definition. tests/t9-r3.test.mjs pins FROZEN to fixtures.json and every bound to the formula below.
//
// FROZEN: the frozen workload values the bounds are derived from (fixtures.bursts, fixtures.stability).
export const FROZEN = Object.freeze({ burstDurationMs: 23040, quietMs: 1000, cycleCount: 60, cycleMs: 10000, cycleCheckpoints: 60 });
// DRIVER: the driver configuration fixed by the plan (warm-up 3 s, G6 window 30 s, G7 late limit 4 ms, G8 waits, G10 deadline). Node refuses a
// trial whose recorded configuration differs (measure/timing.mjs), so a test-only override can never yield accepted evidence.
export const DRIVER = Object.freeze({ warmupSeconds: 3, g6WindowSeconds: 30, lateLimitMs: 4, g8WaitMs: 5000, g8DrainMs: 2000, g8SettleMs: 50, g10TimeoutMs: 20000 });
// WINDOW_PLANS: per gate, the measured windows in order, each with its fixed maximum duration (a supervisory bound, not a gate threshold):
//   G6 window + 10 s; G7 burst schedule (with its quiet period) + 12 s; G8 two waits + drain + settle + 3 s; G10 deadline + 5 s;
//   G12 all cycles + 60 s, a checkpoint at most one cycle + 10 s apart, exactly one checkpoint per cycle; G2 navigation 45 s (the gate's own limit
//   is 10 s; a fresh profile compiles every pipeline inside this window).
const VIEWS = ['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005'];
const plan = list => Object.freeze(list.map(w => Object.freeze(w)));
export const WINDOW_PLANS = Object.freeze({
  timing: plan([...VIEWS.flatMap(v => [0, 1, 2].map(i => ({ name: `G6/${v}/${i}`, boundMs: DRIVER.g6WindowSeconds * 1000 + 10000 }))),
    ...[0, 1, 2].map(i => ({ name: `G7/${i}`, boundMs: FROZEN.burstDurationMs + 12000 }))]),
  G8: plan(Array.from({ length: 10 }, (_, i) => ({ name: `G8/${i}`, boundMs: 2 * DRIVER.g8WaitMs + DRIVER.g8DrainMs + DRIVER.g8SettleMs + 3000 }))),
  G10: plan(VIEWS.map(v => ({ name: `G10/${v}`, boundMs: DRIVER.g10TimeoutMs + 5000 }))),
  G12: plan([{ name: 'G12/sequence', boundMs: FROZEN.cycleCount * FROZEN.cycleMs + 60000, checkpointMs: FROZEN.cycleMs + 10000, checkpoints: FROZEN.cycleCheckpoints }]),
  G2: plan([{ name: 'G2/navigation', boundMs: 45000, implicit: true }]),
});
export const windowPlan = gate => (WINDOW_PLANS[gate] ?? []).map(w => ({ ...w }));
