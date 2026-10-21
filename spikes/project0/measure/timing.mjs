// spikes/project0/measure/timing.mjs — G1, G2, G6–G10, G12 from raw page events. Workload shape is validated against the frozen
// fixtures; integrity violations, schedule deviations, driver errors and malformed observations invalidate.
import { throughput, percentile, coverageValid } from '../metrics.js';
import { maintenanceFailed } from './resources.mjs';
import { activeGpuDriver, activeGpuIds } from '../launch.mjs';
import { compareArithmetic } from '../metrics.js';
import { decodeArith } from './decode.mjs';
import { DRIVER, WINDOW_PLANS } from '../supervision-plan.js';   // the frozen driver configuration and the supervised window bounds (fix round 3)            // the fail-closed Chrome 151 driver parser (T5 fix rounds 4-5)

// The frozen observation durations (T9 fix round 2, Codex T9 r2 finding 3): a G6 window is the 30 s path, a G7 window the frozen burst schedule
// with its quiet period (fx.bursts.durationMs); each is accepted up to the fixed bound of its supervised window (session-utils WINDOW_PLANS).
// Shortened or overlong observations are refused here whatever the driver was told, so a test-only override can never yield accepted evidence.
const G6_WINDOW_MS = DRIVER.g6WindowSeconds * 1000, G6_BOUND_MS = WINDOW_PLANS.timing[0].boundMs, G7_BOUND_MS = WINDOW_PLANS.timing.at(-1).boundMs;
// Fix round 3 (Codex T9 r3): Node checks the frozen configuration each G6/G7 trial records, and its measured warm-up, not only duration ranges.
const FROZEN_CONFIG = { G6: () => ({ warmupSeconds: DRIVER.warmupSeconds, windowSeconds: DRIVER.g6WindowSeconds }), G7: fx => ({ warmupSeconds: DRIVER.warmupSeconds, quietMs: fx.bursts.quietMs, lateLimitMs: DRIVER.lateLimitMs }) };
function frozenConfig(gate, raw, fx) {
  const want = FROZEN_CONFIG[gate](fx), got = raw.config;
  if (!got || typeof got !== 'object' || Object.keys(got).length !== Object.keys(want).length || Object.entries(want).some(([k, v]) => got[k] !== v))
    throw invalid(`${gate}: the driver configuration differs from the frozen one (${JSON.stringify(got ?? null)}, expected ${JSON.stringify(want)})`);
  const w = raw.warmupMs, low = DRIVER.warmupSeconds * 1000;
  if (typeof w !== 'number' || !Number.isFinite(w) || w < low || w > G6_BOUND_MS) throw invalid(`${gate}: the warm-up covered ${w} ms, not the frozen ${low} ms (accepted up to ${G6_BOUND_MS} ms)`);
}
function covered(gate, ms, fx) {
  const [low, high, what] = gate === 'G6' ? [G6_WINDOW_MS, G6_BOUND_MS, 'the measured path'] : [fx.bursts.durationMs, G7_BOUND_MS, 'the burst window'];
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < low || ms > high) throw invalid(`${gate}: ${what} covered ${ms} ms, not the frozen ${low} ms (accepted up to ${high} ms)`);
}
const G9_SOURCES = [...['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005'].flatMap(v => [0, 1, 2].map(i => `G6/${v}/${i}`)), 'G7/0', 'G7/1', 'G7/2'];
export const LATE_LIMIT_MS = 4;                                  // the frozen G7 issuance-deviation limit (same constant as the driver)
const KINDS = new Set(['application', 'harness', 'unattributed']);
const invalid = message => Object.assign(new Error(message), { invalidation: true });
const finite = (x, what) => { if (typeof x !== 'number' || !Number.isFinite(x)) throw invalid(`${what} must be a finite number`); return x; };
function integrityOk(raw) { if (!raw.integrity || !Array.isArray(raw.integrity.violations)) throw invalid('no integrity observation'); if (raw.integrity.violations.length) throw invalid(raw.integrity.violations.join('; ')); }
// A frame counts only if it is the expected view, at the expected profile's dimensions, complete, and coverage-valid for that view.
function frameOk(f, view, profile) { return Boolean(f && f.counts && f.view === view && f.W === profile.W && f.H === profile.H && f.counts.total === profile.W * profile.H && coverageValid(view, f.counts)); }

// G1 (rev. WebGPU remediation prereg rev 2, G1-A §3.2-§3.4). Corroboration needs, all at once:
//  - a completed probe on the bound device whose returned samples pass the frozen arithmetic comparison (G4's bulb set and rules);
//  - the selected adapter's identity, read from the very GPUAdapter that created the device, before and after requestDevice (and
//    device.adapterInfo when exposed): vendor `nvidia`, backend `vulkan`, type `discrete gpu` (trimmed, case-normalised), isFallbackAdapter
//    false and a `device` that is, as a whole string, ^(0x)?[0-9a-fA-F]{1,8}$; present overlapping fields must agree;
//  - exactly one ACTIVE chrome://gpu record (launch.mjs activeGpuIds, the reviewed record selection) captured from the same browser after the
//    probe, with vendor 0x10de and a device ID numerically equal to the selected adapter's, the hardware-accelerated WebGPU row and an
//    unambiguous driver record; an earlier capture in the same session must not disagree;
//  - the run binding: the page's run and document, the owned browser process (pid and start time) and the page target unchanged across the
//    probe, one main-frame navigation, and no page crash or device loss.
// Absent, malformed or ambiguous diagnostics are `identity unavailable`; disagreeing observations are `identity conflicting`; a value that is
// present but not the required hardware is `identity not corroborated`; software execution is named first, independently of the rest.
const WEBGPU_ROW = /^[ \t]*(?:\*[ \t]*)?WebGPU:[ \t]*(.+)$/m;
const SELECTED_DEVICE = /^(0x)?[0-9a-fA-F]{1,8}$/;
const norm = v => (typeof v === 'string' ? v.trim().toLowerCase() : v);
function probeVerified(words, fx) {
  if (!fx) return 'probe readback is not verified: no frozen fixtures to compare against';
  try {
    const p = fx.arithmeticProtocol.bulb, m = compareArithmetic(fx.arithmetic.bulb, decodeArith(words, fx.arithmetic.bulb.length, { minIndex: 1, cap: p.iterations, de: true }), p.tolerances);
    const eligible = fx.arithmetic.bulb.filter(s => s.eligible).length;
    if (m.samples !== fx.arithmetic.bulb.length || m.eligible !== eligible || m.statusErrors || m.indexErrors || !(m.logRRatio <= 1) || !(m.deRatio <= 1)) return `probe readback fails the frozen arithmetic comparison (${JSON.stringify(m)})`;
    return null;
  } catch (e) { return `probe readback is not verified: ${e.message}`; }
}
export function g1Metrics(raw, fx) {
  const { adapterInfo: a, chromeGpuText: textBefore, chromeGpuTextAfter: text, probeOk } = raw ?? {};
  const invalidations = [], unavailable = why => invalidations.push(`identity unavailable: ${why}`), conflicting = why => invalidations.push(`identity conflicting: ${why}`), notCorroborated = why => invalidations.push(`identity not corroborated: ${why}`);
  const id = a?.identity, sel = id?.before?.present ?? null;
  const desc = `${sel?.vendor ?? a?.vendor ?? ''} ${sel?.architecture ?? a?.architecture ?? ''} ${sel?.description ?? a?.description ?? ''}`;
  const fallback = sel?.isFallbackAdapter ?? a?.isFallbackAdapter;
  const software = fallback === true || norm(sel?.type) === 'cpu' || /swiftshader|llvmpipe|lavapipe|software/i.test(desc) ? 1 : 0;
  if (software) invalidations.push(`software adapter: ${fallback === true ? 'isFallbackAdapter is true' : norm(sel?.type) === 'cpu' ? 'adapter type is CPU' : `adapter identity names a software renderer: ${desc.trim()}`}`);
  const nvidia = !software && norm(sel?.vendor ?? a?.vendor) === 'nvidia' ? 1 : 0;
  // the bound probe: completed on the device, and its samples verified here
  if (!probeOk) invalidations.push('probe dispatch did not complete on the selected adapter');
  const probe = probeVerified(raw?.probeWords, fx);
  if (probe) invalidations.push(probe);
  // the selected adapter
  let selectedDevice = null;
  if (!id || !id.before || !id.after) unavailable('no selected-adapter information snapshots (before and after requestDevice)');
  else {
    for (const k of ['vendor', 'backend', 'type', 'isFallbackAdapter', 'device']) if (id.before.absent?.includes(k) || !(k in id.before.present)) unavailable(`selected-adapter ${k} is absent`);
    if ('vendor' in sel && norm(sel.vendor) !== 'nvidia') notCorroborated(`selected-adapter vendor ${JSON.stringify(sel.vendor)} is not nvidia`);
    if ('backend' in sel && sel.backend !== 'vulkan') notCorroborated(`selected-adapter backend ${JSON.stringify(sel.backend)} is not vulkan`);
    if ('type' in sel && norm(sel.type) !== 'discrete gpu') notCorroborated(`selected-adapter type ${JSON.stringify(sel.type)} is not a discrete GPU`);
    if ('isFallbackAdapter' in sel && sel.isFallbackAdapter !== false) notCorroborated(`isFallbackAdapter is ${JSON.stringify(sel.isFallbackAdapter)}`);
    if ('device' in sel) {
      const d = typeof sel.device === 'string' ? sel.device.trim() : null;
      if (d === null || !SELECTED_DEVICE.test(d)) unavailable(`selected-adapter device ${JSON.stringify(sel.device)} is not a whole hexadecimal identifier`);
      else selectedDevice = parseInt(d.replace(/^0x/i, ''), 16);
    }
    for (const [name, other] of [['after requestDevice', id.after], ['device.adapterInfo', id.deviceAdapterInfo]]) {
      if (!other) continue;
      for (const [k, v] of Object.entries(other.present ?? {})) if (k in sel && sel[k] !== v) conflicting(`adapter ${k} ${JSON.stringify(sel[k])} before requestDevice, ${JSON.stringify(v)} in ${name}`);
    }
  }
  // the ACTIVE record captured from the same browser after the probe
  let active = null;
  if (typeof text !== 'string' || !text) unavailable('no chrome://gpu capture after the probe');
  else {
    try { active = activeGpuIds(text); } catch (e) { unavailable(e.message); }
    try { activeGpuDriver(text); } catch (e) { unavailable(e.message); }
    const webgpuRow = WEBGPU_ROW.exec(text)?.[1]?.trim();
    if (!webgpuRow) unavailable('chrome://gpu has no WebGPU feature-status row');
    else if (webgpuRow !== 'Hardware accelerated') notCorroborated(`chrome://gpu WebGPU status is ${JSON.stringify(webgpuRow)}`);
  }
  if (active && active.vendorId !== 0x10de) notCorroborated(`the ACTIVE vendor is 0x${active.vendorId.toString(16)}, not 0x10de`);
  if (active && selectedDevice !== null && active.deviceId !== selectedDevice) conflicting(`selected-adapter device 0x${selectedDevice.toString(16)} contradicts the ACTIVE device 0x${active.deviceId.toString(16)}`);
  if (active && typeof textBefore === 'string' && textBefore) {
    let earlier = null; try { earlier = activeGpuIds(textBefore); } catch { /* an unparseable earlier capture is not an identity observation */ }
    if (earlier && (earlier.vendorId !== active.vendorId || earlier.deviceId !== active.deviceId)) conflicting(`the ACTIVE record changed during the session (0x${earlier.deviceId.toString(16)} before, 0x${active.deviceId.toString(16)} after)`);
  }
  // the run, browser-process and document binding
  const s = raw?.session, doc = raw?.document;
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  if (!s || !doc) unavailable('binding: no session or document identity');
  else {
    if (typeof s.run !== 'string' || !s.run || s.run !== doc.run) conflicting(`binding: the page reports run ${JSON.stringify(doc.run)}, the session is ${JSON.stringify(s.run)}`);
    if (typeof doc.id !== 'string' || !doc.id) unavailable('binding: no document identity');
    if (!s.browser?.before?.pid || !same(s.browser.before, s.browser.after)) conflicting(`binding: browser process ${JSON.stringify(s.browser?.before ?? null)} became ${JSON.stringify(s.browser?.after ?? null)}`);
    if (!s.target?.before || s.target.before !== s.target.after) conflicting(`binding: page target ${JSON.stringify(s.target?.before ?? null)} became ${JSON.stringify(s.target?.after ?? null)}`);
    if (s.mainFrameNavigations !== 1) conflicting(`binding: ${s.mainFrameNavigations} main-frame navigations (exactly one required)`);
    if (s.crashed || s.closed) conflicting('binding: the page crashed or closed before the evidence was complete');
    if (s.deviceLost || raw.lossEvents > 0) conflicting('binding: a device-loss event was observed');
  }
  const corroborated = nvidia && !software && active && invalidations.length === 0 ? 1 : 0;
  return { metrics: { nvidia, software, corroborated }, invalidations };
}

function validateG7(raw, fx) {
  const schedule = fx.bursts.requests, issued = raw.issued;
  if (!Array.isArray(issued) || issued.length !== schedule.length) throw invalid(`G7 expects ${schedule.length} issued requests`);
  const ids = new Set();
  issued.forEach((r, i) => {
    const s = schedule[i];
    if (r.id !== s.id || r.burst !== s.burst || r.index !== s.index) throw invalid(`G7 request ${i} does not match the frozen schedule`);
    if (!Number.isInteger(r.requestId) || ids.has(r.requestId)) throw invalid(`G7 request ${i} has a missing or duplicate request identity`);
    ids.add(r.requestId);
    for (const k of ['scheduledMs', 'firedMs', 'requestedMs']) finite(r[k], `G7 request ${i} ${k}`);
    if (!(r.firedMs >= r.scheduledMs - 0.1 && r.requestedMs >= r.firedMs)) throw invalid(`G7 request ${i}: timestamps out of order`);
  });
  // The scheduled times themselves must follow the frozen offsets (a uniform stretch or a shifted burst is a different workload).
  const origin = issued[0].scheduledMs - schedule[0].offsetMs;
  issued.forEach((r, i) => {
    const expected = origin + schedule[i].offsetMs, tolerance = 8 * Number.EPSILON * Math.max(1, Math.abs(expected));
    if (Math.abs(r.scheduledMs - expected) > tolerance) throw invalid(`G7 request ${i}: scheduled time differs from the frozen offset`);
  });
  const frameIds = raw.frames.map(f => f.requestId);
  if (new Set(frameIds).size !== frameIds.length) throw invalid('G7: duplicate publications');
  const late = issued.filter(r => r.firedMs - r.scheduledMs > LATE_LIMIT_MS);
  if (late.length) {
    const causes = late.reduce((m, r) => ({ ...m, [r.lateCause ?? 'unknown']: (m[r.lateCause ?? 'unknown'] ?? 0) + 1 }), {});
    throw invalid(`G7 schedule deviation: ${late.length} requests fired more than ${LATE_LIMIT_MS} ms late (${Object.entries(causes).map(([k, v]) => `${k}: ${v}`).join(', ')}); not accepted as execution of the frozen schedule`);
  }
  return issued.filter(r => r.index === fx.bursts.requestsPerBurst - 1).map((r, i) => {
    const matches = raw.frames.filter(f => f.requestId === r.requestId);
    if (matches.length !== 1) throw new Error(`final request ${i} was never published`);
    for (const k of ['submittedMs', 'completedMs', 'publishedMs']) finite(r[k], `G7 final ${i} ${k}`);
    if (!(r.requestedMs <= r.submittedMs && r.submittedMs <= r.completedMs && r.completedMs <= r.publishedMs && r.publishedMs === matches[0].t)) throw invalid(`G7 final ${i}: stage timestamps out of order`);
    return r.publishedMs - r.requestedMs;
  });
}

// G9's binding to its companions (T9 fix round 3, Codex T9 r3 finding 4), reusable at evidence-read time (T10's recompute/qualify): every source
// window must name a companion record of the same invocation that is itself valid, and must be exactly the interval that companion observed
// ([windowStart, windowStart + observedMs) of its raw payload). `companionOf(gate, slot)` returns {invalidations, raw} or null. Returns the
// problems (empty when bound); the caller records them as invalidations.
export function validateSources(raw, companionOf) {
  const problems = [];
  for (const src of Array.isArray(raw?.sources) ? raw.sources : []) {
    const id = `${src?.gate}/${src?.slot}`, c = companionOf(src?.gate, src?.slot);
    if (!c) { problems.push(`G9: source window ${id} has no companion record`); continue; }
    if (c.invalidations?.length) { problems.push(`G9: source window ${id} is invalid (${c.invalidations[0]})`); continue; }
    const start = c.raw?.windowStart, end = start + c.raw?.observedMs;
    if (!(Number.isFinite(start) && Number.isFinite(end)) || !(Math.abs(src.windowStart - start) <= 1e-6 && Math.abs(src.windowEnd - end) <= 1e-6))
      problems.push(`G9: source window ${id} is [${src.windowStart}, ${src.windowEnd}), but its companion observed [${start}, ${end})`);
  }
  return problems;
}

// G12's recorded schedule (T9 fix round 4, Codex T9 r4 finding 1). Every scheduling field must be finite and the skip flags explicit; the planned
// intervals must be the frozen grid (cycle i starts at c0₀ + i·cycleMs, phase k is planned for [c0 + phaseOffsetsMs[k], c0 + phaseOffsetsMs[k+1]));
// the actual record must be ordered (cycle start ≤ each phase's start ≤ its end ≤ the next phase's start ≤ checkpoint sent ≤ replied ≤ cycle end ≤
// the next cycle's first phase); the skip flag must be the driver's rule in both directions: a run phase started before its planned end and covers
// its span up to it (the driver's path runs until then), a skipped phase started at or after its planned end and has no span. The overrun is derived exactly as the driver decides it: the reply
// came after the boundary; an on-time cycle waits until its boundary. A flag, a deadline-miss count or a wall time that contradicts these
// timestamps invalidates; genuine overruns stay as recorded deadline misses (a performance result, not an invalidation).
const same = (a, b) => Math.abs(a - b) <= 8 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
function validateCycleLog(raw, fx) {
  const { cycleCount, cycleMs, phaseOffsetsMs: off } = fx.stability, PHASES = fx.stability.phases.slice(0, 3);
  if (!Array.isArray(raw.cycleLog) || raw.cycleLog.length !== raw.cycles) throw invalid(`G12: the cycle log has ${raw.cycleLog?.length} cycles, not ${raw.cycles}`);
  if (raw.cycles !== cycleCount) throw invalid(`G12: the sequence ran ${raw.cycles} cycles, not the frozen ${cycleCount}`);
  let previousEnd = null, origin = null, misses = 0;
  raw.cycleLog.forEach((c, i) => {
    if (c?.cycle !== i) throw invalid(`G12: cycle log entry ${i} is cycle ${c?.cycle}`);
    const views = (c.phases ?? []).map(p => p?.view);
    if (views.join() !== PHASES.join()) throw invalid(`G12: cycle ${i} phases are ${views.join(', ')}`);
    finite(c.c0, `G12: cycle ${i} c0`);
    c.phases.forEach(p => {
      for (const k of ['plannedStartMs', 'plannedEndMs', 'startMs', 'endMs']) finite(p[k], `G12: cycle ${i} ${p.view} ${k}`);
      if (typeof p.skipped !== 'boolean') throw invalid(`G12: cycle ${i} ${p.view} does not record whether it was skipped`);
    });
    for (const k of ['checkpointSentMs', 'checkpointRepliedMs', 'endedMs']) finite(c[k], `G12: cycle ${i} ${k}`);
    if (typeof c.overrun !== 'boolean') throw invalid(`G12: cycle ${i} does not record its overrun`);
    // the frozen grid
    if (i === 0) origin = c.c0;
    const c0 = origin + i * cycleMs, boundary = c.c0 + cycleMs;
    if (!same(c.c0, c0)) throw invalid(`G12: cycle ${i} starts at ${c.c0} ms, not at the frozen origin ${c0} ms`);
    c.phases.forEach((p, k) => {
      const from = c.c0 + off[k], until = c.c0 + off[k + 1];
      if (!same(p.plannedStartMs, from) || !same(p.plannedEndMs, until)) throw invalid(`G12: cycle ${i} ${p.view} is planned for [${p.plannedStartMs}, ${p.plannedEndMs}), not the frozen [${from}, ${until})`);
    });
    // the actual order and spans
    let at = previousEnd ?? c.c0, after = previousEnd === null ? `the cycle's start ${c.c0} ms` : `cycle ${i - 1}'s end ${previousEnd} ms`;
    if (c.c0 > at) { at = c.c0; after = `the cycle's start ${c.c0} ms`; }
    for (const p of c.phases) {
      if (p.startMs < at) throw invalid(`G12: cycle ${i} ${p.view} started at ${p.startMs} ms, before ${after}`);
      if (p.endMs < p.startMs) throw invalid(`G12: cycle ${i} ${p.view} ended at ${p.endMs} ms, before it started at ${p.startMs} ms`);
      if (p.skipped) {
        if (p.startMs < p.plannedEndMs) throw invalid(`G12: cycle ${i} ${p.view} was skipped at ${p.startMs} ms, before its planned end ${p.plannedEndMs} ms`);
        if (p.endMs !== p.startMs) throw invalid(`G12: cycle ${i} ${p.view} was skipped but records a span [${p.startMs}, ${p.endMs})`);
      } else if (p.startMs >= p.plannedEndMs) throw invalid(`G12: cycle ${i} ${p.view} is recorded as run, but it started at ${p.startMs} ms, at or after its planned end ${p.plannedEndMs} ms (the driver skips a phase whose time is gone)`);
      else if (p.endMs < p.plannedEndMs && !same(p.endMs, p.plannedEndMs)) throw invalid(`G12: cycle ${i} ${p.view} ran until ${p.endMs} ms, before its planned end ${p.plannedEndMs} ms`);
      at = p.endMs; after = `the end of ${p.view} at ${p.endMs} ms`;
    }
    if (c.checkpointSentMs < at) throw invalid(`G12: cycle ${i}'s checkpoint was sent at ${c.checkpointSentMs} ms, before ${after}`);
    if (c.checkpointRepliedMs < c.checkpointSentMs) throw invalid(`G12: cycle ${i}'s checkpoint replied at ${c.checkpointRepliedMs} ms, before it was sent at ${c.checkpointSentMs} ms`);
    if (c.endedMs < c.checkpointRepliedMs) throw invalid(`G12: cycle ${i} ended at ${c.endedMs} ms, before its checkpoint replied at ${c.checkpointRepliedMs} ms`);
    // the derived overrun
    const overrun = c.checkpointRepliedMs > boundary;
    if (overrun !== c.overrun) throw invalid(`G12: cycle ${i}'s checkpoint replied at ${c.checkpointRepliedMs} ms, ${overrun ? 'after' : 'before'} its boundary at ${boundary} ms, but overrun is ${c.overrun}`);
    if (!overrun && c.endedMs < boundary) throw invalid(`G12: cycle ${i} ended at ${c.endedMs} ms, before its boundary at ${boundary} ms`);
    if (overrun || c.phases.some(p => p.skipped)) misses++;
    previousEnd = c.endedMs;
  });
  if (raw.deadlineMisses !== misses) throw invalid(`G12: deadlineMisses ${raw.deadlineMisses}, but the cycle log records ${misses}`);
  const span = raw.cycleLog.at(-1).endedMs - origin;
  if (!same(finite(raw.wallMs, 'G12 wallMs'), span)) throw invalid(`G12: wallMs ${raw.wallMs} is not the recorded span ${span} ms (cycle 0 start to cycle ${raw.cycles - 1} end)`);
}

export function metrics(gate, slot, raw, fx) {
  const draft = fx.profiles.draft, settled = fx.profiles.settled;
  if (raw?.error) throw invalid(`driver error: ${raw.error}`);
  switch (gate) {
    case 'G1': { const { metrics: m, invalidations } = g1Metrics(raw, fx); if (invalidations.length) throw invalid(invalidations.join('; ')); return m; }
    case 'G2': {
      integrityOk(raw);
      const prep = raw.statusLog.find(e => e.text.startsWith('preparing'));
      return { navigationMs: finite(raw.navigationMs, 'navigationMs'), ...(slot === 'warm' ? {} : { emptyProfile: raw.emptyProfile, freshProcess: raw.freshProcess }),
        preparationVisible: prep && prep.visible && prep.t < raw.navigationMs ? 1 : 0, coverageErrors: frameOk(raw.frame, 'bulb-overview', draft) ? 0 : 1, outstandingMax: raw.outstandingMax };
    }
    case 'G6': {
      integrityOk(raw);
      covered('G6', raw.observedMs, fx); frozenConfig('G6', raw, fx);
      const view = slot.split('/')[0];
      const t = throughput(raw.frames.map(f => ({ id: f.requestId, time: f.t })), raw.windowStart, raw.windowStart + 30000);
      const inWindow = raw.frames.filter(f => f.t >= raw.windowStart && f.t < raw.windowStart + 30000);
      return { ...t, pendingMax: raw.pendingMax, coverageErrors: inWindow.filter(f => !frameOk(f, view, draft)).length, outstandingMax: raw.outstandingMax };
    }
    case 'G7': {
      integrityOk(raw);
      covered('G7', raw.observedMs, fx); frozenConfig('G7', raw, fx);
      const latencies = validateG7(raw, fx);
      return { requests: raw.issued.length, finals: latencies.length, latencyP95: percentile(latencies, 0.95), coverageErrors: raw.frames.filter(f => !frameOk(f, 'bulb-overview', draft)).length, outstandingMax: raw.outstandingMax };
    }
    case 'G8': {
      integrityOk(raw);
      const submitted = raw.stressSubmit && raw.stressSubmit.requestId === raw.stressRequestId && raw.stressSubmit.t <= raw.sphereRequested ? 1 : 0;
      const sphereOk = raw.sphere && raw.sphere.requestId === raw.sphereRequestId && frameOk(raw.sphere, 'sphere', draft);
      return { stressSubmitted: submitted, latencyMs: raw.sphere ? raw.sphere.t - raw.sphereRequested : Number.MAX_VALUE, stalePublications: raw.stalePublications, coverageErrors: sphereOk ? 0 : 1, outstandingMax: raw.outstandingMax };
    }
    case 'G9': {
      if (raw.windows !== 12) throw invalid(`G9 expects 12 observation windows, got ${raw.windows}`);
      // T9 fix rounds 1-2 (Codex T9 r1 finding 3, r2 finding 3): G9 is bound to its source windows, the nine G6 and three G7 trials in order, each valid, and
      // every long task must lie in one of them. An interrupted or invalid source window can never yield clean G9 evidence.
      if (!Array.isArray(raw.sources) || raw.sources.length !== G9_SOURCES.length) throw invalid('G9: the twelve source windows are not recorded');
      raw.sources.forEach((x, i) => {
        const id = `${x?.gate}/${x?.slot}`;
        if (id !== G9_SOURCES[i]) throw invalid(`G9: source window ${i} is ${id}, expected ${G9_SOURCES[i]}`);
        if (x.valid !== true) throw invalid(`G9: source window ${id} is not valid`);
        if (!(Number.isFinite(x.windowStart) && Number.isFinite(x.windowEnd) && x.windowEnd > x.windowStart)) throw invalid(`G9: source window ${id} has no finite interval`);
        // fix round 2: each window has its frozen duration, and the twelve are disjoint and in order
        const d = x.windowEnd - x.windowStart, [low, high] = x.gate === 'G6' ? [G6_WINDOW_MS, G6_BOUND_MS] : [fx.bursts.durationMs, G7_BOUND_MS];
        if (d < low || d > high) throw invalid(`G9: source window ${id} lasted ${d} ms; the frozen ${x.gate} window is ${x.gate === 'G6' ? '' : 'at least '}${low} ms (accepted up to ${high} ms)`);
        if (i > 0 && x.windowStart < raw.sources[i - 1].windowEnd) throw invalid(`G9: source window ${id} overlaps the previous window`);
      });
      if (!Array.isArray(raw.longTasks) || !raw.longTasks.every(t => KINDS.has(t.kind) && typeof t.ms === 'number' && Number.isFinite(t.ms) && t.ms > 0 && Number.isFinite(t.start))) throw invalid('G9: malformed long-task records');
      if (!Number.isInteger(raw.harnessMeasures)) throw invalid('G9: harness attribution was not recorded');
      const outside = raw.longTasks.find(t => !raw.sources.some(x => t.start >= x.windowStart && t.start < x.windowEnd));
      if (outside) throw invalid(`G9: a long task at ${outside.start} lies outside every source window`);
      const over = kind => raw.longTasks.filter(t => t.kind === kind && t.ms > 50).length;
      return { windows: raw.windows, applicationOver50: over('application'), unattributedOver50: over('unattributed'), harnessRecorded: raw.harnessMeasures > 0 ? 1 : 0 };
    }
    case 'G10': {
      integrityOk(raw);
      if (!raw.frame) throw new Error(`${slot}: settled frame never published`);
      return { elapsedMs: raw.frame.t - raw.requestedMs, prepared: raw.prepared, coverageErrors: frameOk(raw.frame, slot, settled) ? 0 : 1, outstandingMax: raw.outstandingMax };
    }
    case 'G12': {
      integrityOk(raw);
      if (!Array.isArray(raw.maintenance) || raw.maintenance.length !== 1 + Math.floor(fx.stability.cycleCount / fx.stability.resourceEvery)) throw invalid('G12: the maintenance record is incomplete');
      const maintenanceFailures = raw.maintenance.filter(m => maintenanceFailed(m, fx)).length;
      // Fix rounds 3-4 (Codex T9 r3 finding 3, r4 finding 1): the cycle log records every cycle's three phases (run or skipped), its checkpoint
      // exchange and its end. Node validates the recorded schedule itself and derives the deadline misses from it: no flag is trusted.
      validateCycleLog(raw, fx);
      const counts = ['textures', 'buffers'].reduce((n, k) => n + Math.abs(raw.final[k] - raw.baseline[k]), 0);
      return { cycles: raw.cycles, wallMs: raw.wallMs, deadlineMisses: raw.deadlineMisses, unhandled: raw.unhandled, unplannedLosses: raw.unplannedLosses,
        countDifferences: counts, byteRelativeDifference: Math.abs(raw.final.bytes - raw.baseline.bytes) / raw.baseline.bytes,
        baselinePrepared: raw.baselinePrepared, returned1280: raw.returned1280, maintenanceFailures, outstandingMax: raw.outstandingMax };
    }
    default: throw new Error(`no metric derivation for ${gate}/${slot}`);
  }
}
