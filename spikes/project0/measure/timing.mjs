// spikes/project0/measure/timing.mjs — G1, G2, G6–G10, G12 from raw page events. Workload shape is validated against the frozen
// fixtures; integrity violations, schedule deviations, driver errors and malformed observations invalidate.
import { throughput, percentile, coverageValid } from '../metrics.js';
import { maintenanceFailed } from './resources.mjs';
import { activeGpuDriver } from '../launch.mjs';            // the fail-closed Chrome 151 driver parser (T5 fix rounds 4-5)

// The frozen observation durations (T9 fix round 2, Codex T9 r2 finding 3): a G6 window is the 30 s path, a G7 window the frozen burst schedule
// with its quiet period (fx.bursts.durationMs); each is accepted up to the fixed bound of its supervised window (session-utils WINDOW_PLANS).
// Shortened or overlong observations are refused here whatever the driver was told, so a test-only override can never yield accepted evidence.
const G6_WINDOW_MS = 30000, G6_BOUND_MS = 40000, G7_BOUND_MS = 35000;
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

// Deviation from the plan (controller ruling 1, the T5 defect): Chrome 151 has no "Driver vendor"/"Driver version" rows, bullets its feature-status
// rows ("*   WebGPU: ...") and puts the active GPU's ids in a bracketed `GPU0 :` record value (`VENDOR= 0x10de [Google Inc. (NVIDIA)], DEVICE=0x26b1
// [...], DRIVER_VENDOR=..., DRIVER_VERSION=... *ACTIVE*`). The driver identity is launch.mjs activeGpuDriver's: exactly one *ACTIVE* GPU record
// with a unique driver vendor and version (or, on a page with no GPU records, the legacy rows), otherwise its refusal invalidates. The active
// VENDOR/DEVICE pair is read from the one line marked *ACTIVE*; anything but exactly one parseable line is refused.
const WEBGPU_ROW = /^[ \t]*(?:\*[ \t]*)?WebGPU:[ \t]*(.+)$/m;
function activeDevice(text) {
  const lines = text.split('\n').filter(line => line.includes('*ACTIVE*'));
  if (lines.length !== 1) return null;
  const vendor = /(?:^|[\s,])VENDOR=\s*0x([0-9a-f]+)\b/i.exec(lines[0]), device = /(?:^|[\s,])DEVICE=\s*0x([0-9a-f]+)\b/i.exec(lines[0]);
  return vendor && device ? { vendor: vendor[1].toLowerCase(), device: device[1].toLowerCase() } : null;
}

export function g1Metrics({ adapterInfo: a, chromeGpuText: text, probeOk }) {
  const invalidations = [];
  if (!a || (!a.vendor && !a.description)) invalidations.push('adapter.info is redacted or empty');
  const desc = `${a?.vendor ?? ''} ${a?.architecture ?? ''} ${a?.description ?? ''}`;
  const software = a?.isFallbackAdapter === true || /swiftshader|llvmpipe|lavapipe|software/i.test(desc) ? 1 : 0;
  const nvidia = !software && /nvidia/i.test(desc) ? 1 : 0;
  // T9 fix round 1 (Codex T9 r1, finding 5): software execution is named explicitly, independent of every corroboration error, so the shared stop
  // classifier recognises the record even when the metrics cannot be returned.
  if (software) invalidations.push(`software adapter: ${a?.isFallbackAdapter === true ? 'isFallbackAdapter is true' : `adapter identity names a software renderer: ${desc.trim()}`}`);
  const webgpuRow = WEBGPU_ROW.exec(text ?? '')?.[1]?.trim();
  if (!webgpuRow) invalidations.push('chrome://gpu has no WebGPU feature-status row');
  let driver = null;
  try { driver = activeGpuDriver(text ?? ''); } catch (e) { invalidations.push(e.message); }
  const active = activeDevice(text ?? '');
  if (!active) invalidations.push('chrome://gpu identifies no active GPU (exactly one *ACTIVE* line with a VENDOR=/DEVICE= pair is required)');
  // Same-adapter evidence: a normalised device identity matched to the active NVIDIA device. Missing or unrecognised identity is
  // inconclusive; a contradiction invalidates. A generic NVIDIA description alone does not establish the match.
  if (!/^0x[0-9a-f]+$/i.test(a?.device || '')) invalidations.push(`adapter device identity is missing or unrecognised (${JSON.stringify(a?.device ?? null)})`);
  else if (active && parseInt(a.device, 16) !== parseInt(active.device, 16)) invalidations.push(`adapter device ${a.device} contradicts the active GPU 0x${active.device}`);
  if (!probeOk) invalidations.push('probe dispatch did not complete on the selected adapter');
  const corroborated = nvidia && webgpuRow === 'Hardware accelerated' && active && active.vendor === '10de' && driver && probeOk && invalidations.length === 0 ? 1 : 0;
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

export function metrics(gate, slot, raw, fx) {
  const draft = fx.profiles.draft, settled = fx.profiles.settled;
  if (raw?.error) throw invalid(`driver error: ${raw.error}`);
  switch (gate) {
    case 'G1': { const { metrics: m, invalidations } = g1Metrics(raw); if (invalidations.length) throw invalid(invalidations.join('; ')); return m; }
    case 'G2': {
      integrityOk(raw);
      const prep = raw.statusLog.find(e => e.text.startsWith('preparing'));
      return { navigationMs: finite(raw.navigationMs, 'navigationMs'), ...(slot === 'warm' ? {} : { emptyProfile: raw.emptyProfile, freshProcess: raw.freshProcess }),
        preparationVisible: prep && prep.visible && prep.t < raw.navigationMs ? 1 : 0, coverageErrors: frameOk(raw.frame, 'bulb-overview', draft) ? 0 : 1, outstandingMax: raw.outstandingMax };
    }
    case 'G6': {
      integrityOk(raw);
      covered('G6', raw.observedMs, fx);
      const view = slot.split('/')[0];
      const t = throughput(raw.frames.map(f => ({ id: f.requestId, time: f.t })), raw.windowStart, raw.windowStart + 30000);
      const inWindow = raw.frames.filter(f => f.t >= raw.windowStart && f.t < raw.windowStart + 30000);
      return { ...t, pendingMax: raw.pendingMax, coverageErrors: inWindow.filter(f => !frameOk(f, view, draft)).length, outstandingMax: raw.outstandingMax };
    }
    case 'G7': {
      integrityOk(raw);
      covered('G7', raw.observedMs, fx);
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
      const counts = ['textures', 'buffers'].reduce((n, k) => n + Math.abs(raw.final[k] - raw.baseline[k]), 0);
      return { cycles: raw.cycles, wallMs: raw.wallMs, deadlineMisses: raw.deadlineMisses, unhandled: raw.unhandled, unplannedLosses: raw.unplannedLosses,
        countDifferences: counts, byteRelativeDifference: Math.abs(raw.final.bytes - raw.baseline.bytes) / raw.baseline.bytes,
        baselinePrepared: raw.baselinePrepared, returned1280: raw.returned1280, maintenanceFailures, outstandingMax: raw.outstandingMax };
    }
    default: throw new Error(`no metric derivation for ${gate}/${slot}`);
  }
}
