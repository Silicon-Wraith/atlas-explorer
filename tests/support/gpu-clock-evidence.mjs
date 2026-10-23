// O1b measurement protocol. Observation only: never lock clocks or create a warm load.
import { spawn } from 'node:child_process';
import { within, LIMITS } from './bounded.mjs';

export const GPU_CLOCK_PROTOCOL = 'atlas.gpu-clocks-v1';
export const GPU_CLOCK_INTERVAL_MS = 100;
export const GPU_CLOCK_BANDS = Object.freeze([270, 600, 1200]);
export function clockBand(mhz) {
  if (!Number.isFinite(mhz) || mhz <= 0) return null;
  return mhz < 270 ? 'lt270' : mhz < 600 ? '270-600' : mhz < 1200 ? '600-1200' : 'ge1200';
}
const median = values => {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null;
};
export function epochClockWindows(timeOriginMs, phases = {}) {
  if (!Number.isFinite(timeOriginMs)) return {};
  return Object.fromEntries(['orbit', 'interaction', 'stress'].filter(name => phases[name]).map(name =>
    [name, { start: timeOriginMs + phases[name].start, end: timeOriginMs + phases[name].end }]));
}
function parseSamples(raw) {
  const samples = [], errors = [];
  for (const line of raw.split(/\r?\n/).filter(line => line.trim())) {
    const fields = line.split(',').map(v => v.trim());
    const [timestamp, uuid, clock, pstate, power] = fields;
    const at = /^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d\.\d{3}$/.test(timestamp) ? Date.parse(timestamp.replaceAll('/', '-').replace(' ', 'T') + 'Z') : NaN;
    const smMHz = clock === '' ? NaN : Number(clock), powerDrawW = power === '' ? NaN : Number(power);
    if (fields.length !== 5 || !Number.isFinite(at) || !uuid?.startsWith('GPU-') || !clockBand(smMHz) || !/^P(?:[0-9]|1[0-5])$/.test(pstate) || !Number.isFinite(powerDrawW) || powerDrawW < 0) {
      errors.push(`malformed or unsupported clock sample: ${line}`); continue;
    }
    samples.push({ at, uuid, smMHz, pstate, powerDrawW });
  }
  return { samples, errors };
}
export function summarizeGpuClocks({ raw = '', errors = [] } = {}, windows = {}) {
  const parsed = parseSamples(raw), problems = [...errors, ...parsed.errors];
  const uuids = [...new Set(parsed.samples.map(s => s.uuid))];
  if (uuids.length !== 1) problems.push('exactly one identifiable GPU is required; multiple devices are ambiguous');
  const summarize = entries => {
    const selected = parsed.samples.filter(s => entries.some(([, w]) => s.at >= w.start && s.at <= w.end));
    const reasons = [...problems];
    if (!entries.length) reasons.push('no measured phase windows');
    for (const [name, w] of entries) {
      if (!Number.isFinite(w.start) || !Number.isFinite(w.end) || w.end <= w.start) { reasons.push(`${name}: invalid window`); continue; }
      const times = [...new Set(selected.filter(s => s.at >= w.start && s.at <= w.end).map(s => s.at))].sort((a, b) => a - b);
      const expected = (w.end - w.start) / GPU_CLOCK_INTERVAL_MS;
      const boundaries = [w.start, ...times, w.end];
      const gaps = boundaries.slice(1).map((at, i) => at - boundaries[i]);
      if (times.length < Math.max(2, Math.ceil(expected * .8)) || Math.max(...gaps) > 500) reasons.push(`${name}: sparse clock samples (need 80% of 100 ms cadence and no gap over 500 ms)`);
    }
    const medianMHz = median(selected.map(s => s.smMHz)), band = clockBand(medianMHz);
    const pstateCounts = {}; for (const s of selected) pstateCounts[s.pstate] = (pstateCounts[s.pstate] ?? 0) + 1;
    return { protocol: GPU_CLOCK_PROTOCOL, state: reasons.length ? 'unavailable' : 'measured', reason: reasons.join('; ') || null,
      uuid: uuids.length === 1 ? uuids[0] : null, sampleCount: selected.length, medianMHz, band,
      bandShare: selected.length ? selected.filter(s => clockBand(s.smMHz) === band).length / selected.length : 0,
      minMHz: selected.length ? Math.min(...selected.map(s => s.smMHz)) : null, maxMHz: selected.length ? Math.max(...selected.map(s => s.smMHz)) : null,
      pstateCounts, powerDrawMedianW: median(selected.map(s => s.powerDrawW)) };
  };
  const entries = Object.entries(windows);
  return { ...summarize(entries), intervalMs: GPU_CLOCK_INTERVAL_MS, windows, samples: parsed.samples, errors: problems,
    phases: Object.fromEntries(entries.map(entry => [entry[0], summarize([entry])])),
    latency: summarize(entries.filter(([name]) => name === 'orbit' || name === 'interaction')) };
}
export function usableGpuClocks(summary) {
  return summary?.protocol === GPU_CLOCK_PROTOCOL && summary.state === 'measured' && clockBand(summary.medianMHz) === summary.band &&
    summary.band !== null && typeof summary.uuid === 'string' && summary.uuid.length > 0 && summary.sampleCount >= 2;
}
export function compareGpuClocks(summaries) {
  const mediansMHz = summaries.map(s => s?.medianMHz ?? null), bands = summaries.map(s => s?.band ?? null);
  let reason;
  if (!summaries.length || summaries.some(s => !usableGpuClocks(s))) reason = 'missing or unusable clock sampling evidence';
  else if (new Set(summaries.map(s => s.uuid)).size !== 1) reason = 'different GPU identities';
  else if (new Set(bands).size !== 1) reason = 'different SM clock bands';
  else if (summaries.some(s => !Number.isFinite(s.bandShare) || s.bandShare < .9)) reason = 'mixed clock regime: fewer than 90% of samples in the median band';
  else if (Math.max(...mediansMHz) > Math.min(...mediansMHz) * 1.10) reason = 'same-band median clocks differ by more than 10%';
  return { state: reason ? 'inconclusive' : 'comparable', reason: reason ?? null, mediansMHz, bands };
}

export async function stopGpuClockMonitor({ monitor, stopped, isDone, wait = within }) {
  let escalation;
  try {
    if (!isDone()) monitor.kill('SIGTERM');
    const termination = await wait(stopped, LIMITS.cleanup, 'clock monitor SIGTERM cleanup');
    return { state: 'confirmed', termination };
  } catch (error) { escalation = String(error); }
  try {
    if (!isDone()) monitor.kill('SIGKILL');
    const termination = await wait(stopped, LIMITS.cleanup, 'clock monitor SIGKILL cleanup');
    return { state: 'confirmed', escalation, termination };
  } catch (error) { return { state: 'unconfirmed', escalation, error: String(error) }; }
}
export function startGpuClockMonitor({ spawnMonitor = spawn, wait = within } = {}) {
  const chunks = [], errors = [];
  let monitor, stopped, done = false, closing = false, stopping;
  try {
    monitor = spawnMonitor('nvidia-smi', ['--query-gpu=timestamp,uuid,clocks.sm,pstate,power.draw', '--format=csv,noheader,nounits', '--loop-ms=100'],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TZ: 'UTC' } });
    stopped = new Promise(resolve => {
      monitor.on('error', error => errors.push(String(error)));
      monitor.once('close', (code, signal) => { done = true; if (!closing) errors.push(`clock monitor exited during collection (${code}, ${signal})`); resolve({ code, signal }); });
    });
    monitor.stdout.on('data', data => chunks.push(String(data)));
    monitor.stderr.on('data', data => errors.push(String(data)));
  } catch (error) { errors.push(String(error)); }
  return { stop() {
    return stopping ??= (async () => {
      closing = true;
      const cleanup = monitor ? await stopGpuClockMonitor({ monitor, stopped, isDone: () => done, wait }) : { state: 'confirmed', reason: 'not spawned' };
      return { raw: chunks.join(''), errors, cleanup };
    })();
  } };
}
