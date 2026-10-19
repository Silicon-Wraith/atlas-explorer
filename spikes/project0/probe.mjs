// spikes/project0/probe.mjs — first GPU run. Headed and headless, fresh profiles, attempt-1 flags. Each mode runs under an outer deadline;
// every outcome ends in an evidence record; a late result cannot resume work; a stop prevents the second mode. Dependencies are
// injectable for tests.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, HARNESS_PATH, startServer, launchChrome, effectiveCommandLine, assertSandboxed } from './launch.mjs';
import { fixtureIdentity, implementationIdentity, launchIdentity, environmentIdentity, newRunDir, writeRecord } from './evidence.mjs';
import { bounded, boundedStart, waitResult, stopReasons } from './session-utils.mjs';

export async function runProbeInvocation(deps = {}) {
  const d = { chromium, startServer, launchChrome, effectiveCommandLine, waitResult, fixtureIdentity, implementationIdentity, newRunDir, writeRecord,
    browserVersion: async () => (await promisify(execFile)('google-chrome', ['--version'])).stdout.trim(), modeMs: 180000, stepMs: 20000, log: console.log, ...deps };
  const fixture = await d.fixtureIdentity(), implementation = await d.implementationIdentity();
  const runDir = await d.newRunDir('probe');
  const records = []; let stopped = null, server = null;
  try {
    server = await d.startServer();
    for (const mode of ['headed', 'headless']) {
      if (stopped) { d.log(`${mode}: NOT RUN (stopped: ${stopped})`); continue; }
      const invalidations = [], state = { expired: false }; let launched = null, probe = { ok: false }, chromeGpuText = '', launchInfo = { requestedArgs: null, mode }, identity = null;
      const live = () => { if (state.expired) throw new Error('browser hang: probe mode deadline passed'); };   // a late result cannot resume work
      const op = async () => {
        launched = await boundedStart(() => d.launchChrome({ headless: mode === 'headless', profileKind: `probe-${mode}`, chromium: d.chromium }), d.stepMs * 3, 'browser hang: launch'); live();
        const commandLine = await bounded(d.effectiveCommandLine(launched.context), d.stepMs, 'browser hang: chrome://version'); live(); assertSandboxed(commandLine);
        launchInfo = { requestedArgs: launched.requestedArgs, commandLine, profile: launched.profile, mode };
        const page = await bounded(launched.context.newPage(), d.stepMs, 'browser hang: new page'); live();
        page.on('pageerror', e => invalidations.push(`page error: ${e.message}`));
        await bounded(page.goto(`${server.url}${HARNESS_PATH}?mode=probe&runMode=${mode}`), d.stepMs, 'browser hang: navigation'); live();
        const { result } = await d.waitResult(page, { gate: 'probe', runDir, deadlineMs: d.stepMs * 3 }); live();
        probe = result.error ? { ok: false, error: result.error } : result.slots[0].raw;
        invalidations.push(...(result.invalidations ?? []), ...(result.error ? [`page: ${result.error}`] : []));
        const gpuPage = await bounded(launched.context.newPage(), d.stepMs, 'browser hang: new page'); live();
        await bounded(gpuPage.goto('chrome://gpu'), d.stepMs, 'browser hang: chrome://gpu'); live();
        chromeGpuText = await bounded(gpuPage.locator('body').innerText(), d.stepMs, 'browser hang: chrome://gpu text'); live();
        try { identity = { ...launchIdentity(launchInfo), ...environmentIdentity(chromeGpuText, { browserVersion: await d.browserVersion(), browserExecutable: commandLine.split(/\s+/)[0], session: process.env.XDG_SESSION_TYPE || 'unknown' }) }; }
        catch (e) { invalidations.push(`environment identity: ${e.message}`); }
      };
      try { await bounded(op(), d.modeMs, `browser hang: probe ${mode} exceeded its ${d.modeMs} ms outer deadline`); }
      catch (error) { state.expired = true; invalidations.push(`session: ${error.message}`); }
      finally { await bounded(launched?.context.close() ?? Promise.resolve(), d.stepMs, 'close').catch(e => invalidations.push(`close: ${e.message}`)); }
      identity ??= { launchHash: '0'.repeat(64), mode, browserVersion: 'unknown', browserExecutable: 'unknown', driver: 'unknown', session: 'unknown' };
      const incomplete = !probe.info && !probe.readback;
      const record = { schema: 1, id: `probe-${mode}`, gate: 'probe', slot: incomplete ? 'incomplete' : mode, campaign: 'probe', mode, experiment: true, identity: { backend: 'webgpu', ...fixture, ...implementation, ...identity }, invalidations, metrics: { probeOk: probe.ok === true ? 1 : 0 } };
      records.push(await d.writeRecord(runDir, record, [
        { name: `probe-${mode}.raw.json`, data: JSON.stringify(probe) },
        { name: `probe-${mode}.launch.json`, data: JSON.stringify(launchInfo) },
        { name: `probe-${mode}.chrome-gpu.txt`, data: chromeGpuText }]));
      d.log(`${mode}: ${probe.ok && !invalidations.length ? 'PROBE OK' : 'PROBE FAILED'} ${probe.error || invalidations.join('; ')} vendor=${probe.info?.vendor} fallback=${probe.info?.isFallbackAdapter} (${probe.info?.fallbackSource}) mismatches=${probe.readback?.mismatches}`);
      if (stopReasons(record).length) stopped = `${mode}: ${stopReasons(record).join(', ')}`;
    }
  } finally { await server?.stop(); }
  return { records, runDir, stopped };
}

// The probe succeeds only if both modes completed, recorded no invalidation and passed their own readback check.
export const probeSucceeded = records => records.length === 2 &&
  records.every(r => r.slot !== 'incomplete' && r.invalidations.length === 0 && r.metrics?.probeOk === 1);

if (import.meta.url === `file://${process.argv[1]}`) {
  process.env.TMPDIR = resolve(ROOT, 'artifacts/runtime');
  const { records, runDir } = await runProbeInvocation();
  console.log(`evidence: ${runDir}`);
  process.exitCode = probeSucceeded(records) ? 0 : 1;
}
